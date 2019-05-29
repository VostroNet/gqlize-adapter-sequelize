/*

The MIT License (MIT)

Copyright (c) 2015 Mick Hansen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import Sequelize from "sequelize";
import {
  GraphQLInt,
  GraphQLString,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLEnumType,
  GraphQLList,
} from "graphql";

import jsonType from "@vostro/graphql-types/lib/json";
import dateType from "@vostro/graphql-types/lib/date";
import uploadType from "@vostro/graphql-types/lib/upload";

import {capitalize} from "./utils/word";

export default function typeMapper(type, modelName, fieldName) {
  return toGraphQL(type, Sequelize, modelName, fieldName);
}

/**
 * Checks the type of the sequelize data type and
 * returns the corresponding type in GraphQL
 * @param  {Object} sequelizeType
 * @param  {Object} sequelizeTypes
 * @return {Function} GraphQL type declaration
 */
export function toGraphQL(sequelizeType, sequelizeTypes, modelName, fieldName) {
  const {
    BOOLEAN,
    ENUM,
    FLOAT,
    REAL,
    CHAR,
    DECIMAL,
    DOUBLE,
    INTEGER,
    BIGINT,
    STRING,
    TEXT,
    UUID,
    DATE,
    DATEONLY,
    TIME,
    ARRAY,
    VIRTUAL,
    JSON,
    JSONB,
    GEOMETRY,
    UUIDV4,
    BLOB,
    MACADDR,
    CIDR,
    INET,
  } = sequelizeTypes;

  // Map of special characters
  const specialCharsMap = new Map([
    ["¼", "frac14"],
    ["½", "frac12"],
    ["¾", "frac34"]
  ]);

  if (sequelizeType instanceof BOOLEAN) {
    return GraphQLBoolean;
  }

  if (sequelizeType instanceof FLOAT ||
    sequelizeType instanceof REAL ||
    sequelizeType instanceof DOUBLE
  ) {
    return GraphQLFloat;
  }

  if (sequelizeType instanceof DATE) {
    return dateType;
  }

  if (
    sequelizeType instanceof CHAR ||
    sequelizeType instanceof STRING ||
    sequelizeType instanceof TEXT ||
    sequelizeType instanceof UUID ||
    sequelizeType instanceof UUIDV4 ||
    sequelizeType instanceof DATEONLY ||
    sequelizeType instanceof TIME ||
    sequelizeType instanceof BIGINT ||
    sequelizeType instanceof DECIMAL ||
    sequelizeType instanceof MACADDR ||
    sequelizeType instanceof CIDR ||
    sequelizeType instanceof INET
  ) {
    return GraphQLString;
  }

  if (sequelizeType instanceof INTEGER) {
    return GraphQLInt;
  }

  if (sequelizeType instanceof ARRAY) {
    let elementType = toGraphQL(sequelizeType.type, sequelizeTypes, modelName, fieldName);
    return new GraphQLList(elementType);
  }

  if (sequelizeType instanceof ENUM) {
    let values = sequelizeType.values.reduce((o, k) => {
      o[sanitizeEnumValue(k)] = {
        value: k,
      };
      return o;
    }, {});
    return new GraphQLEnumType({
      name: `${capitalize(modelName)}${capitalize(fieldName)}Enum`,
      values,
    });
  }

  if (sequelizeType instanceof VIRTUAL) {
    let returnType = sequelizeType.returnType
      ? toGraphQL(sequelizeType.returnType, sequelizeTypes)
      : GraphQLString;
    return returnType;
  }

  if (sequelizeType instanceof JSONB || sequelizeType instanceof JSON || sequelizeType instanceof GEOMETRY) {
    return jsonType;
  }
  if (sequelizeType instanceof BLOB) {
    return uploadType;
  }
  throw new Error(
    `Unable to convert ${sequelizeType.key ||
      sequelizeType.toSql()} to a GraphQL type`
  );

  function sanitizeEnumValue(value) {
    return value
      .trim()
      .replace(/([^_a-zA-Z0-9])/g, (_, p) => specialCharsMap.get(p) || " ")
      .split(" ")
      .map((v, i) => (i ? capitalize(v) : v))
      .join("")
      .replace(/(^\d)/, "_$1");
  }
}
