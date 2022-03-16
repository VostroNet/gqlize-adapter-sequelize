
export default function unique(arr: any[]) {
  return arr.filter(function(value, index, self) {
    return self.indexOf(value) === index;
  });
}
