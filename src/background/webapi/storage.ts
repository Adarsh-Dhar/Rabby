import browser from 'webextension-polyfill';

let cacheMap: Map<string, any>;

const get = async <T = any>(
  prop?: string
): Promise<typeof prop extends void ? any : T> => {
  if (!cacheMap) {
    const result = await browser.storage.local.get(null);
    cacheMap = new Map(Object.entries(result ?? {}).map(([k, v]) => [k, v]));
  }

  // @ts-expect-error we know if prop is void, it will return the whole cacheMap
  return cacheMap.get(prop);
};

const set = async (prop: string, value: any): Promise<void> => {
  await browser.storage.local.set({ [prop]: value });
  cacheMap.set(prop, value);
};

const byteInUse = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (chrome) {
      chrome.storage.local.getBytesInUse((value) => {
        resolve(value);
      });
    } else {
      reject('ByteInUse only works in Chrome');
    }
  });
};

const clearCache = () => {
  cacheMap = undefined as any;
};

export default {
  get,
  set,
  byteInUse,
  clearCache,
};
