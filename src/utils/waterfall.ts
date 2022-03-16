

export default function waterfall(arr: (Promise<any> | any) = [], func: ((val: any, previousVal: any) => Promise<any>), start?: any) {
  if (!Array.isArray(arr)) {
    arr = [arr];
  }
  return arr.reduce(function(promise: Promise<any>, val: any) {
    return promise.then(function(prevVal) {
      return func(val, prevVal);
    });
  }, Promise.resolve(start));
}
