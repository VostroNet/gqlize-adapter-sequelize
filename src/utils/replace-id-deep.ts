
import {fromGlobalId} from "graphql-relay";
import waterfall from "./waterfall";
import {Op} from "sequelize";

function getProperties(obj: any): any {
  return [...Object.keys(obj), ...Object.getOwnPropertySymbols(obj)];
}

import { OKind, objVisit, BREAK } from "@vostro/object-visit";

export default function replaceIdDeep(obj: any, keyMap: string[], variableValues: any) {
  if (obj instanceof Function) {
    obj = obj(variableValues);
  }
  let tagged = false;
  const result = objVisit(obj, {
    [OKind.ARRAY]: {
      enter(node, key, parent, path, ancestors) {
        if(node instanceof Function) {
          node = node(variableValues);
        }
        if(key && !tagged && keyMap.indexOf(`${key}`) > -1) {
          tagged = true;          
        }
        return node;
      },
      leave(node, key, parent, path, ancestors) {
        if (tagged && keyMap.indexOf(`${key}`) > -1) {
          tagged = false;
        } 
        return node;
      }
    },
    [OKind.OBJECT]: {
      enter(node, key, parent, path, ancestors) {
        if(node instanceof Function) {
          node = node(variableValues);
        }
        if(key && !tagged && keyMap.indexOf(`${key}`) > -1) {
          tagged = true;          
        }
        return node;
      },
      leave(node, key, parent, path, ancestors) {
        if (tagged && keyMap.indexOf(`${key}`) > -1) {
          tagged = false;
        } 
        return node;
      }
    },
    [OKind.FIELD]: {
      enter(node, key, parent, path, ancestors) {
        if (node instanceof Function) {
          node = node(variableValues);
        }
        if (key && !tagged && keyMap.indexOf(`${key}`) > -1) {
          tagged = true;          
        }
        if (tagged && typeof node === "string" && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(node)) {
          return fromGlobalId(node).id;
        }
        return node;
      },
      leave(node, key, parent, path, ancestors) {
        if (tagged && keyMap.indexOf(`${key}`) > -1) {
          tagged = false;
        } 
        return node;
      }
    }
  });
  return result;
}



function hasUserPrototype(obj: any) {
  if (!obj) {
    return false;
  }
  return Object.getPrototypeOf(obj) !== Object.prototype;
}
async function checkObjectForWhereOps(value: any[], keyMap: any, params: any): Promise<any> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((val) => {
      return checkObjectForWhereOps(val, keyMap, params);
    }));
  } else if (hasUserPrototype(value)) {
    return value;
  } else if (Object.prototype.toString.call(value) === "[object Object]") {
    return replaceDefWhereOperators(value, keyMap, params);
  } else {
    return value;
  }
}

export async function replaceDefWhereOperators(obj: any, keyMap: any, options: any) {
  return waterfall(getProperties(obj), async(key, memo) => {
    if (keyMap[key]) {
      const newWhereObj = await keyMap[key](memo, options, obj[key]);
      delete memo[key];
      memo = getProperties(newWhereObj).reduce((m: any, newKey: any) => {
        if (m[newKey]) {
          const newValue = {
            [newKey]: newWhereObj[newKey],
          };
          if (Array.isArray(m[newKey])) {
            m[newKey] = m[newKey].concat(newValue);
          } else if (m[Op.and]) {
            m[Op.and] = m[Op.and].concat(newValue);
          } else if (m.and) { //Cover both before and after replaceWhereOps
            m.and = m.and.concat(newValue);
          } else {
            const prevValue = {
              [newKey]: m[newKey],
            };
            m[Op.and] = [prevValue, newValue];
          }
        } else {
          m[newKey] = newWhereObj[newKey];
        }
        return m;
      }, memo);
      memo = await checkObjectForWhereOps(memo, keyMap, options);
    } else {
      memo[key] = await checkObjectForWhereOps(memo[key], keyMap, options);
    }
    // return the modified object
    return memo;

  }, Object.assign({}, obj));
}
