/* eslint-disable no-underscore-dangle */
import {
  Model,
  ModelCtor,
  Op,
  QueryTypes,
  Sequelize,
} from "sequelize";
import logger from "./utils/logger";
import unique from './utils/unique';
import typeMapper from "./type-mapper";
import replaceIdDeep, {
  replaceDefWhereOperators,
} from "./utils/replace-id-deep";
const log = logger("gqlize::adapter::sequelize::");

// import jsonType from "@vostro/graphql-types/lib/json";
import createQueryType from "@vostro/graphql-types/lib/query";

import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLID,
  GraphQLList,
  GraphQLObjectType,
  GraphQLType,
} from "graphql";
// import {GraphQLObjectType} from "graphql";
import { GraphQLInputObjectType } from "graphql";
import waterfall from "./utils/waterfall";
import { Association, GqlizeAdapter, WhereOperators, DefinitionFieldMeta } from '@azerothian/gqlize/src/types';
import { SequelizeDefinition, SqlClassMethod } from "./types";
import { replaceWhereOperators } from "./utils/where-ops";



function safeStringify(value: any) {
  const seen = new Set();
  return JSON.stringify(
    value,
    (k, v) => {
      if (seen.has(v) || k === "sequelize") {
        return "...";
      }
      if (typeof v === "object") {
        seen.add(v);
      }
      return v;
    },
    2
  );
}

export default class SequelizeAdapter implements GqlizeAdapter {
  adapterName: string;
  sequelize: Sequelize;
  options: any;
  startup: { drop: string; create: string };
  meta: { [modelName: string]: { [objName: string]: any } };
  constructor(adapterOptions = {}, ...config: any) {
    //allows the adaptor to have the same config options as sequelize
    this.adapterName = "sequelize";
    this.sequelize = new Sequelize(...config);
    this.options = adapterOptions;
    // this.startupScript;
    this.startup = {
      drop: "",
      create: "",
    };
    this.meta = {};
  }
  initialise = async () => {
    return undefined;
  };
  sync = async (options?: any) => {
    if (this.startup.create !== "") {
      await this.getORM().query(this.startup.create);
    }
     await this.getORM().sync(options);
  };
  reset = async (options?: any) => {
    if (this.startup.drop !== "") {
      await this.getORM().query(this.startup.drop);
    }
    await this.getORM().sync({ force: true, ...(options || {}) });
    if (this.startup.create !== "") {
      await this.getORM().query(this.startup.create);
    }
  };
  getORM = () => {
    return this.sequelize;
  };
  addInstanceFunction = (
    modelName: string ,
    funcName: string,
    func: any
  ) => {
    this.sequelize.models[modelName].prototype[funcName] = func;
  };

  addStaticFunction = (modelName: any, funcName: any, func: any) => {
    (this.sequelize.models as any)[modelName][funcName] = func;
  };
  getModel = (modelName: string) => {
    return this.sequelize.models[modelName];
  };
  getModels = () => {
    return this.sequelize.models as any;
  };
  getMetaObj = <T>(modelName: string, metaName: string): T => {
    if(!this.meta[modelName]) {
      this.meta[modelName] = {};
    }
    return this.meta[modelName][metaName] as T;
  };
  setMetaObj = (modelName: string, metaName: string, value: any) => {
    if(!this.meta[modelName]) {
      this.meta[modelName] = {};
    }
    this.meta[modelName][metaName] = value;
  };
  getTypeMapper = () => {
    return typeMapper;
  };
  // getAccessors() {
  //   return {
  //     "findAll": "findAll",
  //     "findOne": "findOne",
  //     "create": "create",
  //     "update": "update"
  //   }
  // }
  getFields = (modelName: string) => {
    const Model = this.sequelize.models[modelName];
    //TODO add filter for excluding or including fields
    if (!this.getMetaObj(modelName, "fields")) {
      const fieldNames = Object.keys(Model.rawAttributes);
      const fields = fieldNames.reduce((fields, key) => {
        const attr = Model.rawAttributes[key];
        const autoPopulated =
          attr.autoIncrement === true ||
          attr.defaultValue !== undefined ||
          !!(Model as any)._dataTypeChanges[key]; //eslint-disable-line
        const allowNull = attr.allowNull === true;
        const foreignKey = !!attr.references;
        let foreignTarget;
        if (foreignKey) {
          foreignTarget = Object.keys(Model.associations)
            .filter((assocKey) => {
              return Model.associations[assocKey].identifier === key || (Model.associations[assocKey] as any).identifierField === key;
            })
            .map((assocKey) => {
              return Model.associations[assocKey].target.name;
            })[0];
          if (!foreignTarget) {
            //TODO: better error logging
            let message = `An error has occurred with relationships on model - ${modelName} - ${key}`;
            if (process.env.NODE_ENV !== "production") {
              const jsonAssociations = safeStringify(Model.associations);
              const jsonRelationships = safeStringify(
                (Model as any).relationships
              );
              message = `Model: ${modelName} - Unable to find ${key} identifier field association in the model associations \n ---Associations--- ${jsonAssociations}\n ---Relationships--- ${jsonRelationships}`;
            }
            throw new Error(message);
          }
        }

        fields[key] = {
          name: key,
          type: attr.type,
          primaryKey: attr.primaryKey === true,
          allowNull,
          description: attr.comment,
          defaultValue: attr.defaultValue,
          foreignKey,
          foreignTarget,
          autoPopulated,
          ignoreGlobalKey: (attr as any).ignoreGlobalKey,
        } as DefinitionFieldMeta;
        return fields;
      }, {} as { [key: string]: DefinitionFieldMeta });
      this.setMetaObj(modelName, "fields", fields);
    }
    return this.getMetaObj(modelName, "fields") as { [key: string]: DefinitionFieldMeta };
  };
  getAssociations = (modelName: string): { [relName: string]: Association } => {
    const Model = this.sequelize.models[modelName];
    let associations: { [relName: string]: Association } = this.getMetaObj(modelName, "associations");
    if (associations) {
      return associations;
    }
    associations = Object.keys(Model.associations).reduce(
      (rels, key) => {
        const assoc = Model.associations[key] as any;
        const { associationType } = assoc;
        rels[key] = {
          name: key,
          target: assoc.target.name,
          source: assoc.source.name,
          associationType: `${associationType
            .charAt(0)
            .toLowerCase()}${associationType.slice(1)}`,
          foreignKey: assoc.foreignKey,
          targetKey: assoc.targetKey, // TODO: not in types?
          sourceKey: assoc.sourceKey, // TODO: not in types?
          accessors: assoc.accessors, // TODO: not in types?
        };
        return rels;
      },
      {} as { [relName: string]: Association }
    );
    this.setMetaObj(modelName, "associations", associations);
    return associations;
    
  };
  getAssociation = (modelName: any, assocName: string) => {
    const rels = this.getAssociations(modelName);
    return rels[assocName];
  };
  createModel = async (def: SequelizeDefinition, hooks?: any): Promise<any> => {
    const { defaultAttr, defaultModel } = this.options;
    const newDef = Object.assign({}, def, {
      options: Object.assign({}, defaultModel, def.options, {
        hooks,
      }),
    });
    // const hooks = [this.options.hooks || {}, schemaOptions.hooks || {}];
    // schemaOptions = Object.assign(schemaOptions, {
    //   hooks: generateHooks(hooks, def.name),
    // });
    if(!newDef.name) {
      throw "Unable to create model with no name";
    }
    const defName = newDef.name;
    this.sequelize.define(
      defName,
      Object.assign({}, defaultAttr, newDef.define),
      newDef.options
    );

    let { classMethods, instanceMethods, queries } = newDef;
    if (queries) {
      Object.keys(queries).forEach((k) => {
        const q = queries[k];
        if (q.drop) {
          this.startup.drop += `${isFunction(q.drop) ? q.drop() : q.drop}\n`;
        }
        if (q.create) {
          this.startup.create += `${
            isFunction(q.create) ? q.create() : q.create
          }\n`;
        }
      });
    }



    if (newDef.disablePrimaryKey) {
      this.sequelize.models[newDef.name].removeAttribute("id");
    }
    if (newDef.removeAttributes) {
      newDef.removeAttributes.forEach((attr: any) => {
        this.sequelize.models[defName].removeAttribute(attr);
      });
    }
    if (newDef.options?.classMethods) {
      classMethods = {
        ...classMethods || {},
        ...newDef.options.classMethods,
      };
    }
    if (newDef.options?.instanceMethods) {
      instanceMethods = {
        ...instanceMethods || {},
        ...newDef.options.instanceMethods,
      };
    }

    if (classMethods) {
      await Promise.all(
        Object.keys(classMethods).map(async (classMethod) => {
          if (classMethods) {
            if (isFunction(classMethods[classMethod])) {
              (this.sequelize.models[defName] as any)[classMethod] =
                classMethods[classMethod];
            } else {
              (this.sequelize.models[defName] as any)[
                classMethod
              ] = await this.generateSQLFunction(
                classMethods[classMethod] as any
              );
            }
          }
        })
      );
    }
    if (instanceMethods) {
      Object.keys(instanceMethods).forEach((instanceMethod) => {
        if (instanceMethods) {
          this.sequelize.models[defName].prototype[instanceMethod] =
            instanceMethods[instanceMethod];
        }
      });
    }
    (this.sequelize.models[newDef.name].prototype as any).Model = this.sequelize.models[
      newDef.name
    ];
    // (this.sequelize.models[newDef.name] as any)._gqlmeta = {};
    (this.sequelize.models[newDef.name] as any).definition = newDef;

    return this.sequelize.models[newDef.name] as any;
  };
  createSQLFunction = async (query: string, modelName: string, args: any[]) => {
    return (a: { [x: string]: any }, context: any) => {
      // security check?
      let opts = {
        replacements: args.reduce(
          (o: { [x: string]: any }, ar: string | number) => {
            o[ar] = a[ar] ? a[ar] : null;
            return o;
          },
          {}
        ),
        type: QueryTypes.SELECT,
      } as {
        model: ModelCtor<Model<any, any>>;
        replacements: any;
        type: QueryTypes;
      };
      if (modelName) {
        opts.model = this.sequelize.models[modelName];
      }
      return this.sequelize.query(query, opts);
    };
  };
  generateSQLFunction = async (sqlFunc: SqlClassMethod) => {
    // PostgreSQL supported only atm?
    let {
      type = "query",
      schema = "public",
      functionName,
      query,
      modelName,
      args = [],
    } = sqlFunc;
    let q = "";
    switch (type) {
      case "query":
        q = query;
        break;
      case "sqlfunction":
        if (query) {
          q = query;
        } else {
          q = `SELECT * FROM "${schema}"."${functionName}"(${args
            .map((s: any) => `:${s}`, "")
            .join(",")});`;
        }
    }
    return this.createSQLFunction(q, modelName, args);
  };
  createQueryConfig = (definition: SequelizeDefinition): any => {
    const defName = definition.name;
    if(!defName) {
      throw "no name set";
    }
    const fields = this.getFields(defName);
    let f = Object.keys(fields).reduce((o, k) => {
      const field = fields[k];
      if (field.primaryKey || field.foreignKey) {
        o[k] = GraphQLID;
      } else {
        o[k] = this.getTypeMapper()(
          field.type,
          `GQLTWhere${definition.name}`,
          k
        );
      }
      return o;
    }, {} as { [key: string]: any });
    const rels = this.getAssociations(defName);
    f = Object.keys(rels).reduce((o, k) => {
      const field = rels[k];
      switch (field.associationType) {
        case "belongsTo":
          o[field.foreignKey] = GraphQLID;
          break;
      }
      return o;
    }, f);

    let iso = {} as { [key: string]: any };
    if (definition.whereOperators) {
      iso = Object.keys(definition.whereOperators).reduce((o, k) => {
        if (definition.whereOperatorTypes && (definition.whereOperatorTypes || {})[k]) {
          o[k] = definition.whereOperatorTypes[k];
        } else {
          o[k] = GraphQLBoolean;
        }
        return o;
      }, iso);
    }
    return {
      modelName: definition.name,
      fields: f,
      isolatedFields: iso,
      valueFuncs: [
        "eq",
        "ne",
        "gte",
        "lte",
        "lt",
        "not",
        "is",
        "like",
        "notLike",
        "iLike",
        "notILike",
        "startsWith",
        "endsWith",
        "substring",
        "regexp",
        "notRegexp",
        "iRegexp",
        "notIRegexp",
      ],
      arrayFuncs: ["or", "and", "any", "all"],
      arrayValues: [
        "in",
        "notIn",
        "contains",
        "contained",
        "between",
        "notBetween",
        "overlap",
        "adjacent",
        "strictLeft",
        "strictRight",
        "noExtendRight",
        "noExtendLeft",
      ],
    };
  };
  createRelationship = (
    targetModel: string,
    sourceModel: string ,
    name: string,
    type: string,
    options: {through?: {model?: any}} = {}
  ) => {
    let model = this.sequelize.models[targetModel];
    if (!(model as any).relationships) {
      (model as any).relationships = {};
    }
    try {
      if (options.through) {
        if (options.through.model) {
          options.through.model = this.sequelize.models[options.through.model as any];
        }
      }
      const opts = Object.assign(
        {
          as: name,
        },
        options
      );
      (model as any).relationships[name] = {
        name: name,
        type: type,
        source: sourceModel,
        target: targetModel,
        options: opts,
        rel: (model as any)[type](this.sequelize.models[sourceModel], opts),
      };
    } catch (err) {
      log.error("Error Mapping relationship", {
        model,
        sourceModel,
        name,
        type,
        options,
        err,
      });
    }
    this.sequelize.models[targetModel] = model;
  };
  createFunctionForFind = (modelName: string) => {
    const model = this.sequelize.models[modelName];
    return function(value: any, filterKey: any, singular: boolean) {
      return (options: {
        where?: any
      } = {}) => {
        const opts = Object.assign({}, options, {
          where: mergeFilterStatement(filterKey, value, true, options.where),
        });
        if (!singular) {
          return model.findAll(opts);
        }
        return model.findOne(opts);
      };
    };
  };
  getPrimaryKeyNameForModel = (modelName: string) => {
    const model = this.sequelize.models[modelName];
    if ((model.primaryKeyAttributes || []).length > 0) {
      return [...model.primaryKeyAttributes];
    }
    return [this.sequelize.models[modelName].primaryKeyAttribute];
  };
  getValueFromInstance(data: any, keyName: string | number) {
    if (data.dataValues) {
      return data.dataValues[keyName];
    }
    return data[keyName];
  }
  getFilterGraphQLType = (defName: any, definition: any) => {
    if (!this.getMetaObj(defName, "queryType")) {
      this.setMetaObj(
        defName,
        "queryType",
        createQueryType(this.createQueryConfig(definition))
      );
    }
    return this.getMetaObj(defName, "queryType") as GraphQLInputObjectType;
  };
  getOrderByGraphQLType = (defName: any) => {
    if (!this.getMetaObj(defName, "orderByType")) {
      const fields = this.getFields(defName);
      this.setMetaObj(
        defName,
        "orderByType",
        new GraphQLList(
          new GraphQLEnumType({
            name: `${defName}OrderBy`,
            values: Object.keys(fields).reduce((o, fieldName) => {
              o[`${fieldName}ASC`] = { value: [fieldName, "ASC"] };
              o[`${fieldName}DESC`] = { value: [fieldName, "DESC"] };
              return o;
            }, {} as { [key: string]: any }),
            // description: "",
          })
        )
      );
    }
    return this.getMetaObj(defName, "orderByType") as GraphQLInputObjectType;
  };

  getIncludeGraphQLType = (
    defName: any,
    definition: { relationships: any[] }
  ): GraphQLInputObjectType => {
    if (
      !this.getMetaObj(defName, "includeType") &&
      (definition.relationships || []).length > 0
    ) {
      const fields = definition.relationships.reduce(
        (
          o: { [x: string]: { type: GraphQLInputObjectType } },
          relationship: { model: any; name: string | number }
        ) => {
          const targetModel = this.getModel(relationship.model);
          o[relationship.name] = {
            type: new GraphQLInputObjectType({
              name: `GQLT${defName}Include${relationship.name}Object`,
              fields: () => {
                return {
                  required: {
                    type: GraphQLBoolean,
                  },
                  where: {
                    type: this.getFilterGraphQLType(
                      targetModel.name,
                      (targetModel as any).definition
                    ),
                  },
                  orderBy: {
                    type: this.getOrderByGraphQLType(targetModel.name),
                  },
                  include: {
                    type: this.getIncludeGraphQLType(
                      targetModel.name,
                      (targetModel as any).definition
                    ),
                  },
                };
              },
            }),
          };
          return o;
        },
        {} as {[key: string]: any}
      );
      // const queryConfig = this.createQueryConfig(definition);
      const includeType = new GraphQLInputObjectType({
        name: `GQLT${defName}IncludeObject`,
        fields,
      });
      this.setMetaObj(defName, "includeType", new GraphQLList(includeType));
    }
    return this.getMetaObj(defName, "includeType");
  };
  getDefaultListArgs = (defName: any, definition: any) => {
    const includeType = this.getIncludeGraphQLType(defName, definition);
    const retVal: any = {
      where: {
        type: this.getFilterGraphQLType(defName, definition),
      },
    };

    if (includeType) {
      retVal.include = {
        type: includeType,
      };
    }
    return retVal;
  };
  hasInlineCountFeature = () => {
    if (this.options.disableInlineCount) {
      return false;
    }
    const dialect = this.sequelize.getDialect();
    return (
      dialect === "postgres" || dialect === "mssql" || dialect === "sqlite"
    );
  };
  getInlineCount = async(values: any[]) => {
    let fullCount =
      values[0] &&
      (values[0].dataValues || values[0]).full_count &&
      parseInt((values[0].dataValues || values[0]).full_count, 10);
    if (!values[0]) {
      fullCount = 0;
    }
    return fullCount;
  };
  processListArgsToOptions = async (
    defName: any,
    args: { first?: any; last?: any; orderBy?: any[]; where?: any; include?: any },
    offset?: any,
    info?: any,
    whereOperators?: any,
    defaultOptions: any = {},
    selectedFields?: string | string[] | undefined
  ) => {
    let limit,
      include = [],
      order = [],
      attributes = defaultOptions.attributes || [],
      where;
    // const Model = this.getModel(defName);

    if (args.first || args.last) {
      limit = parseInt(args.first || args.last, 10);
    }
    if (args.orderBy) {
      order = args.orderBy;
    }
    const fields = this.getFields(defName);
    Object.keys(fields).forEach((key) => {
      const field = fields[key];
      if (!field.primaryKey) {
        if (selectedFields) {
          const fieldForeignTarget = field.foreignTarget
            ? field.foreignTarget.toLowerCase()
            : undefined;
          if (selectedFields.indexOf(key) === -1) {
            if (fieldForeignTarget === undefined) {
              return;
            }
            if (
              fieldForeignTarget !==
              selectedFields[selectedFields.indexOf(fieldForeignTarget)]
            ) {
              return;
            }
          }
        }
        attributes.unshift(field.name);
      }
    });
    this.getPrimaryKeyNameForModel(defName).forEach((key: any) => {
      if (key) {
        attributes.unshift(key);
      }
    });
    if (this.hasInlineCountFeature()) {
      // attributes.push(...this.getFields(defName).filter((f) => !f.primaryKey).map((f) => f.name))
      if (
        attributes.filter(
          (a: string | string[]) => a.indexOf("full_count") > -1
        ).length === 0
      ) {
        if (this.sequelize.getDialect() === "postgres") {
          attributes.push([
            this.sequelize.literal("COUNT(*) OVER()"),
            "full_count",
          ]);
        } else if (
          this.sequelize.getDialect() === "mssql" ||
          this.sequelize.getDialect() === "sqlite"
        ) {
          attributes.push([
            this.sequelize.literal("COUNT(1) OVER()"),
            "full_count",
          ]);
        } else {
          throw new Error(
            `Inline count feature enabled but dialect does not match`
          );
        }
      }
    }
    if (args.where) {
      where = await this.processFilterArgument(args.where, whereOperators, defaultOptions);
    }
    if ((args.include || []).length > 0) {
      const result = await this.processIncludeStatement(
        defName,
        args.include,
        order,
        defaultOptions
      );
      order = result.order;
      include = result.include;
      // include = await waterfall(args.include, (i, o) => {
      //   return waterfall(Object.keys(i), async(relName, oo) => {
      //     const inc = i[relName];
      //     const rel = this.getRelationship(defName, relName);
      //     const TargetModel =  this.sequelize.models[rel.target];
      //     const {whereOperators} = TargetModel.definition;
      //     if ((inc.orderBy || []).length > 0) {
      //       order = order.concat(inc.orderBy.map((ob) => {
      //         return [{model: TargetModel, as: relName}].concat(ob);
      //       }));
      //     }
      //     return oo.concat([{
      //       model: TargetModel,
      //       required: inc.required,
      //       as: relName,
      //       where: await this.processFilterArgument(inc.where || {}, whereOperators),
      //     }]);
      //   }, o);
      // }, []);
    }
    return {
      getOptions: Object.assign(
        {
          order,
          where,
          limit,
          offset,
          include,
          attributes: unique(attributes),
        },
        defaultOptions
      ),
      countOptions: !this.hasInlineCountFeature()
        ? Object.assign(
            {
              where,
              attributes,
              include,
            },
            defaultOptions
          )
        : undefined,
    };
  };
  async processIncludeStatement(
    defName: any,
    includeStatements: any,
    order: any,
    options: any,
    parentRelsForOrder: any = [],
  ) {
    let orders = order;
    const incs = await waterfall(
      includeStatements,
      (i, o) => {
        return waterfall(
          Object.keys(i),
          async (relName, oo) => {
            const inc = i[relName];
            const rel = this.getAssociation(defName, relName);
            const TargetModel = this.sequelize.models[rel.target];
            const { whereOperators } = (TargetModel as any).definition;
            const orderAssocPrefix = { model: TargetModel, as: relName };
            if ((inc.orderBy || []).length > 0) {
              orders = [
                ...orders,
                ...inc.orderBy.map((ob: any) => {
                  return [...parentRelsForOrder, orderAssocPrefix, ...ob];
                }),
              ];
            }
            let retVal = {
              model: TargetModel,
              required: inc.required,
              as: relName,
              where: await this.processFilterArgument(
                inc.where || {},
                whereOperators,
                options
              ),
            } as any;
            if (inc.include) {
              const v = await this.processIncludeStatement(
                (TargetModel as any).definition.name,
                inc.include,
                order,
                options,
                [...parentRelsForOrder, orderAssocPrefix]
              );
              retVal.include = v.include;
              orders = [...orders, ...(v.order || [])];
            }
            return [...oo, retVal];
          },
          o
        );
      },
      []
    );
    return {
      include: incs,
      order: orders,
    };
  }
  async processFilterArgument(where: any, whereOperators: any, options: any) {
    const w = replaceWhereOperators(where);
    if (whereOperators) {
      return replaceDefWhereOperators(w, whereOperators, options);
    }
    return w;
  }
  getAllArgsToReplaceId() {
    return ["where", "include"];
  }
  getGlobalKeys = (defName: any) => {
    const fields = this.getFields(defName);
    return Object.keys(fields).filter((key) => {
      return (
        (fields[key].foreignKey || fields[key].primaryKey) &&
        !fields[key].ignoreGlobalKey
      );
    });
  };
  replaceIdInWhere = (where: any, defName: any, variableValues: any) => {
    const globalKeys = this.getGlobalKeys(defName);
    return replaceIdDeep(where, globalKeys, variableValues);
  };
  replaceIdInInclude = (
    arrIncludeVar: any[],
    defName: any,
    variableValues: any
  ) => {
    return arrIncludeVar.map(
      (iv: { [x: string]: { [x: string]: any; include: any; where: any } }) => {
        return Object.keys(iv).reduce((o, relName) => {
          let { include, where, ...rest } = iv[relName];
          o[relName] = rest;
          const rel = this.getAssociation(defName, relName);
          if (where) {
            o[relName].where = this.replaceIdInWhere(
              where,
              rel.target,
              variableValues
            );
          }
          if (include) {
            o[relName].include = this.replaceIdInInclude(
              include,
              rel.target,
              variableValues
            );
          }
          return o;
        }, {} as { [key: string]: any });
      }
    );
  };
  replaceIdInArgs = (
    args: { [x: string]: any; where: any; include: any },
    defName: any,
    variableValues: any
  ) => {
    // const argNames = ["where", "include"];
    let { where, include, ...rest } = args;
    if (include) {
      // const rels = this.getMetaObj(modelName, "relationships")
      rest.include = this.replaceIdInInclude(include, defName, variableValues);
    }
    if (where) {
      rest.where = this.replaceIdInWhere(where, defName, variableValues);
    }
    return rest;
  };

  findAll = (defName: string, options: any) => {
    const Model = this.sequelize.models[defName];
    return Model.findAll(options);
  };
  count = (defName: string, options: any) => {
    const Model = this.sequelize.models[defName];
    return Model.count(options) as any;
  };
  update = (
    source: { update: (arg0: any, arg1: any) => any },
    input: any,
    options: any
  ) => {
    return source.update(input, options);
  };
  getCreateFunction = (defName: string | number) => {
    const Model = this.sequelize.models[defName];
    return (input: any, options: any) => {
      return Model.create(input, options);
    };
  };
  getUpdateFunction = (defName: string | number, whereOperators: any) => {
    const Model = this.sequelize.models[defName];
    return async (
      where: any,
      processInput: (arg0: any) => any,
      options: any
    ) => {
      const items = await Model.findAll({
        where: await this.processFilterArgument(where, whereOperators, options),
        ...options,
      });
      return Promise.all(
        items.map(async (i: { update: (arg0: any, arg1: any) => any }) => {
          const input = await processInput(i);
          if (Object.keys(input).length > 0) {
            return i.update(input, options);
          }
          return i;
        })
      );
    };
  };
  getDeleteFunction = (defName: string | number, whereOperators: any) => {
    const Model = this.sequelize.models[defName];
    return async (
      where: any,
      options: any,
      before: (arg0: any) => any,
      after: (arg0: any) => any
    ) => {
      const items = await Model.findAll({
        where: await this.processFilterArgument(where, whereOperators, options),
        ...options,
      });
      return items.map(async (i: { destroy: (arg0: any) => any }) => {
        i = await before(i);
        await i.destroy(options);
        i = await after(i);
        return i;
      });
    };
  };
  mergeFilterStatement(
    fieldName: any,
    value: any,
    match: boolean | undefined,
    originalWhere: any
  ) {
    return mergeFilterStatement(fieldName, value, match, originalWhere);
  }
  resolveSingleRelationship = async (defName: string, relationship: Association, source: any, args: any, context: any, info: any, options: any) => {
    if (source[relationship.name]) {
      return source[relationship.name];
    }
    return source[relationship.accessors.get](options);
  };
  resolveManyRelationship = async (defName: string, relationship: Association, source: any, args: any, offset: any, whereOperators: WhereOperators | undefined, info: any, options: any) => {
    if (source[relationship.name]) {
      const val = source[relationship.name];
      return {
        total: val.length,
        models: val,
      };
    }
    const { getOptions, countOptions } = await this.processListArgsToOptions(
      defName,
      args,
      offset,
      info,
      whereOperators,
      options
    );
    const models = await source[relationship.accessors.get](getOptions);
    let total;
    if (this.hasInlineCountFeature()) {
      total = await this.getInlineCount(models);
    } else {
      total = await source[relationship.accessors.count](countOptions);
    }
    return {
      total,
      models,
    };
  };
}

// function generateHooks(hooks = [], schemaName) {
//   return hooks.reduce((o, h) => {
//     Object.keys(h).forEach((hookName) => {
//       if (!o[hookName]) {
//         o[hookName] = createHookQueue(hookName, hooks, schemaName);
//       }
//     });
//     return o;
//   }, {});
// }

// function createHookQueue(hookName, hooks, schemaName) {
//   return function(init, options, error) {
//     return hooks.reduce((promise, targetHooks) => {
//       return promise.then(async(val) => {
//         if (targetHooks[hookName]) {
//           let result;
//           if (Array.isArray(targetHooks[hookName])) {
//             result = await waterfall(targetHooks[hookName], (hook, prevResult) => {
//               return hook(prevResult, options, error, schemaName, hookName);
//             }, val);
//           } else {
//             result = await targetHooks[hookName](val, options, error, schemaName, hookName);
//           }
//           if (result) {
//             return result;
//           }
//         }
//         return val;
//       });
//     }, Promise.resolve(init));
//   };
// }

export function mergeFilterStatement(
  fieldName: any,
  value: any,
  match = true,
  originalWhere?: any
): any {
  let targetOp = Op.eq;
  if (Array.isArray(value)) {
    targetOp = match ? Op.in : Op.notIn;
  } else {
    targetOp = match ? Op.eq : Op.ne;
  }
  const filter = {
    [fieldName]: {
      [targetOp]: value,
    },
  };
  if (originalWhere) {
    return {
      [Op.and]: [originalWhere, filter],
    };
  }
  return filter;
}

function isFunction(functionToCheck: any) {
  if (functionToCheck) {
    const type = {}.toString.call(functionToCheck);
    return type === "[object Function]" || type === "[object AsyncFunction]";
  }
  return false;
}
