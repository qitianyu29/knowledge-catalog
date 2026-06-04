// CLI command handlers
//

import * as fs from 'node:fs';

import * as kcmd from '../libts';
import * as dataplex from '../libts/gcp/dataplex';
import * as context from '../libts/gcp/context';


export interface InitOptions {
  entryGroup?: string;
  bigqueryDataset?: string | string[];
  kb?: string;
  pull?: boolean;
}


export interface PushOptions {
  force?: boolean;
  validateOnly?: boolean;
}


export interface CreateInitOptions {
  id: string;
  display?: string;
  description?: string;
  labels?: string;
}


export async function init(options: InitOptions): Promise<number> {
  const ctx = context.ApiContext.default();

  let manifest: kcmd.CatalogManifest;
  if (options.entryGroup) {
    manifest = await kcmd.CatalogManifest.initWithEntryGroup(options.entryGroup, ctx);
  }
  else if (options.kb) {
    manifest = await kcmd.CatalogManifest.initWithKnowledgeBase(options.kb, ctx);
  }
  else if (options.bigqueryDataset) {
    let datasets = '';
    if (Array.isArray(options.bigqueryDataset)) {
      datasets = options.bigqueryDataset.join(',');
    }
    else {
      datasets = options.bigqueryDataset!;
    }
    manifest = await kcmd.CatalogManifest.initWithBigQuery(datasets, ctx);
  }
  else {
    console.error('Error: Must provide either --entry-group or --bigquery-dataset or --kb');
    return 1;
  }

  manifest.save('catalog.yaml');
  console.log(fs.readFileSync('catalog.yaml', 'utf8'));

  if (options.pull) {
    return await pull();
  }

  return 0;
}


export async function pull(): Promise<number> {
  const ctx = context.ApiContext.default();
  const snapshot = await kcmd.CatalogSnapshot.fromPath('.', ctx);

  const catalog = new dataplex.CatalogClient(ctx);
  const sync = new kcmd.CatalogSync(catalog, snapshot);

  console.log('Pulling catalog entries...');
  const result = await sync.pull();

  if (result.success) {
    console.log('Successfully updated local snapshot.');
    return 0;
  }
  else {
    console.error('Error pulling catalog entries:', result.details);
    return 1;
  }
}


export async function push(options: PushOptions): Promise<number> {
  const ctx = context.ApiContext.default();
  const snapshot = await kcmd.CatalogSnapshot.fromPath('.', ctx);

  const catalog = new dataplex.CatalogClient(ctx);
  const sync = new kcmd.CatalogSync(catalog, snapshot);

  console.log('Pushing catalog entries...');
  const result = await sync.push(options);

  if (result.success) {
    console.log('Successfully pushed catalog entries.');
    return 0;
  }
  else {
    console.error('Error pushing catalog entries:', result.details);
    return 1;
  }
}


export async function reference(): Promise<number> {
  const ctx = context.ApiContext.default();

  const snapshot = await kcmd.CatalogSnapshot.fromPath('.', ctx, true);

  const catalog = new dataplex.CatalogClient(ctx);
  const sync = new kcmd.CatalogSync(catalog, snapshot);

  console.log('Pulling reference entries...');
  const result = await sync.reference();

  if (result.success) {
    console.log('Successfully updated local reference entries snapshot.');
    return 0;
  }
  else {
    console.error('Error pulling reference entries:', result.details);
    return 1;
  }
}

export async function createInit(options: CreateInitOptions): Promise<number> {
  const ctx = context.ApiContext.default();

  const catalog = new dataplex.CatalogClient(ctx);

  if (!options.id) {
    console.error('Id must be specified.');
    return 1;
  }

  console.log(options);

  let labels = options.labels;
  if (labels) {
    labels = labels!.replace('\\', '');
    console.log(labels);
  }

  const res = await catalog.createEntryGroup(ctx.project, ctx.location, options.id, {
    name: `projects/${ctx.project}/locations/${ctx.location}/entryGroups/${options.id}`,
    "displayName": options.display,
    "description": options.description,
    labels: `{"name": "wrench","count": "3"}`,
  });

  console.log(res);

  if (res.status != 200 || !res) {
    console.error('Error in creating the entry group', res.message)
    return 1;
  }

  const manifest = await kcmd.CatalogManifest.initWithEntryGroup(`${ctx.project}.${ctx.location}.${options.id}`, ctx);

  manifest.save('catalog.yaml');
  console.log(fs.readFileSync('catalog.yaml', 'utf8'));

  return 0;
}
