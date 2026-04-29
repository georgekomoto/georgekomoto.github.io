export let file = null;
export let partitions = [];
export let mfsVolumes = [];
export let recordings = [];
export let parseError = null;

export function reset() {
  file = null;
  partitions = [];
  mfsVolumes = [];
  recordings = [];
  parseError = null;
}

export function setFile(f) { file = f; }
export function setPartitions(p) { partitions = p; }
export function setMfsVolumes(v) { mfsVolumes = v; }
export function setRecordings(r) { recordings = r; }
export function setParseError(e) { parseError = e; }
