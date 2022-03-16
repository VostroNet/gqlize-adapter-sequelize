import SequelizeAdapter from "../src";
import ItemModel from "./helper/models/item";
import TaskModel from "./helper/models/task";
import TaskItemModel from "./helper/models/task-item";
import waterfall from "../src/utils/waterfall";
import Sequelize from "sequelize";
// import jsonType from "@vostro/graphql-types/lib/json";
// import { SequelizeDefinition } from '../lib/types/index';
// import { Association } from "@vostro/gqlize/lib/types";

describe("tests", () => {
  it("adapter - getORM", () => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    expect(adapter.getORM()).not.toBeUndefined();
  });

  it("adapter - initialize", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.initialise();
    expect(adapter.getORM()).not.toBeUndefined();
  });

  it("adapter - reset", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.reset();
    expect(adapter.getORM()).not.toBeUndefined();
  });

  it("adapter - createModel", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);

    await adapter.reset();
    expect(adapter.getORM().models.Task).not.toBeUndefined();
  });
  it("adapter - getModel", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    await adapter.reset();
    expect(adapter.getModel("Task")).not.toBeUndefined();
  });
  it("adapter - getModels", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    await adapter.reset();
    expect(adapter.getModels().Task).not.toBeUndefined();
  });
  it("adapter - addInstanceFunction", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    adapter.addInstanceFunction("Task", "it", function(this: any) {
      expect(this).toBeInstanceOf(adapter.getModel("Task"));
      return true;
    });
    await adapter.reset();
    const Task = adapter.getModel("Task") as any;
    const task = new Task();
    expect(task.it()).toEqual(true);
  });

  it("adapter - addStaticFunction", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    adapter.addStaticFunction("Task", "it", function() {
      return true;
    });
    await adapter.reset();
    const Task = adapter.getModel("Task") as any;
    expect(Task.it()).toEqual(true);
  });

  it("adapter - createRelationship", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    await adapter.createModel(TaskItemModel);
    await adapter.createModel(ItemModel);

    await waterfall([TaskModel, TaskItemModel, ItemModel], async(model) => {
      return waterfall(model.relationships, async(rel) => {
        return adapter.createRelationship(model.name, rel.model, rel.name, rel.type, rel.options);
      });
    });

    await adapter.reset();
    expect(adapter.getORM().models.Task).not.toBeUndefined();
    expect(adapter.getORM().models.TaskItem).not.toBeUndefined();
    expect(adapter.getORM().models.Item).not.toBeUndefined();
  });
  it("adapter - creaitoredProcedure", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });

    const itemDef = {
      name: "Item",
      define: {
        "name": {
          type: Sequelize.STRING,
          comment: "This is the name!",
          defaultValue: "it",
          allowNull: false,
        },
      },
      queries: {
        selectOne: {
          drop: `DROP FUNCTION IF EXISTS public."selectOne";`,
          create: `
          -- Note this drop function only works on PGSQL >=10
          -- PGSQL <= 9 needs argument definition to drop function
          
          -- FOR PGSQL 9 <=
          -- select format('DROP FUNCTION %s(%s);', p.oid::regproc, pg_get_function_identity_arguments(p.oid))
          -- FROM pg_catalog.pg_proc p LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
          -- WHERE p.oid::regproc::text ilike '%selectOne%';
          
          
          CREATE OR REPLACE FUNCTION public."selectOne"(
            "start" int)
              RETURNS TABLE(id integer)
              LANGUAGE 'plpgsql'
              COST 15
              VOLATILE 
          AS $BODY$
          
          BEGIN
            RETURN QUERY (SELECT "start");
          END
          $BODY$;`,
        },
      },
      classMethods: {
        newStoredProcedure: {
          type: "sqlfunction",
          functionName: `selectOne`,
          args: ["number"],
        },
      },
    } as any;
    await adapter.createModel(itemDef);
    (adapter as any).sequelize.query = async(q: any, options: any) => {
      //stop from writing to sqlite
      //as stored procedures are not supported
      console.log("q", {q, options}); //eslint-disable-line
    };
    await adapter.reset();
    await (adapter.getORM().models.Item as any).newStoredProcedure({
      start: 1,
    });
    expect(adapter.getORM().models.Item).not.toBeUndefined();
  });



  it("adapter - createRelationship - belongsToMany", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {
        "name": {
          type: Sequelize.STRING,
          comment: "This is the name!",
          defaultValue: "it",
          allowNull: false,
        },
      },
      relationships: [{
        type: "belongsToMany",
        model: "ItemChild",
        name: "children",
        options: {
          through: {
            model: "ItemChildMap",
          },
          as: "children",
          foreignKey: "itemId",
        },
      }],
    };
    const itemChildMapDef = {
      name: "ItemChildMap",
      define: {},
      relationships: [{
        type: "belongsTo",
        model: "Item",
        name: "item",
        options: {
          as: "item",
          foreignKey: "itemId",
        },
      }],
    };
    const itemChildDef = {
      name: "ItemChild",
      define: {},
      relationships: [{
        type: "belongsToMany",
        model: "Item",
        name: "parents",
        options: {
          through: {
            model: "ItemChildMap",
          },
          as: "parents",
          foreignKey: "itemChildId",
        },
      }],
    };

    await adapter.createModel(itemDef);
    await adapter.createModel(itemChildMapDef);
    await adapter.createModel(itemChildDef);

    await waterfall([itemDef, itemChildMapDef, itemChildDef], async(model) => {
      return waterfall(model.relationships, async(rel) => {
        return adapter.createRelationship(model.name, rel.model, rel.name, rel.type, rel.options);
      });
    });

    await adapter.reset();
    const {models} = adapter.getORM();
    expect(models.Item).toBeDefined();
    expect(models.ItemChildMap).toBeDefined();
    expect(models.ItemChild).toBeDefined();
  });

  it("adapter - createFunctionForFind", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    await adapter.reset();
    const Task = adapter.getModel("Task");
    const task = await Task.create({
      name: "ttttttttttttttt",
    }) as any;

    const func = await adapter.createFunctionForFind("Task");
    const proxyFunc = await func(task.id, "id", false);
    const result = await proxyFunc() as any;
    expect(result).not.toBeUndefined();
    expect(result).toHaveLength(1);
    expect(result[0].id).toEqual(task.id);
  });
  it("adapter - getPrimaryKeyNameForModel", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    await adapter.reset();
    const primaryKeyName = adapter.getPrimaryKeyNameForModel("Task");
    expect(primaryKeyName[0]).toEqual("id");
  });
  it("adapter - getValueFromInstance", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    await adapter.reset();
    const model = await adapter.getModel("Task").create({
      name: "111111111111111111",
    });
    expect(adapter.getValueFromInstance(model, "name")).toEqual("111111111111111111");
  });



  it("adapter - getFields - primary key", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {
        id: {type: Sequelize.UUID, allowNull: false, unique: true, primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
        },
      },
      relationships: [],
    };
    await adapter.createModel(itemDef);
    await adapter.reset();
    const ItemFields = adapter.getFields("Item");
    expect(ItemFields).toBeDefined();
    expect(ItemFields.id).toBeDefined();
    expect(ItemFields.id.primaryKey).toEqual(true);
    expect(ItemFields.id.autoPopulated).toEqual(true);
    expect(ItemFields.id.allowNull).toEqual(false);
    expect(ItemFields.id.type).toBeInstanceOf(Sequelize.UUID);
  });

  it("adapter - getFields - define field", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {
        "name": {
          type: Sequelize.STRING,
          comment: "This is the name!",
          defaultValue: "it",
          allowNull: false,
        },
      },
      relationships: [],
    };
    await adapter.createModel(itemDef);
    await adapter.reset();
    const ItemFields = adapter.getFields("Item");
    expect(ItemFields).toBeDefined();
    expect(ItemFields.name).toBeDefined();
    expect(ItemFields.name.type).toBeInstanceOf(Sequelize.STRING);
    expect(ItemFields.name.allowNull).toEqual(false);
    expect(ItemFields.name.description).toEqual(itemDef.define.name.comment);
    expect(ItemFields.name.defaultValue).toEqual(itemDef.define.name.defaultValue);
  });

  it("adapter - getFields - relationship foreign keys", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {},
      relationships: [{
        type: "hasMany",
        model: "ItemChild",
        name: "children",
        options: {
          as: "children",
          foreignKey: "parentId",
        },
      }],
    };
    const itemChildDef = {
      name: "ItemChild",
      define: {},
      relationships: [{
        type: "belongsTo",
        model: "Item",
        name: "parent",
        options: {
          as: "parent",
          foreignKey: "parentId",
        },
      }],
    };
    await adapter.createModel(itemDef);
    await adapter.createModel(itemChildDef);
    await waterfall(itemDef.relationships, async(rel) => {
      return adapter.createRelationship(itemDef.name, rel.model, rel.name, rel.type, rel.options);
    });
    await waterfall(itemChildDef.relationships, async(rel) => {
      return adapter.createRelationship(itemChildDef.name, rel.model, rel.name, rel.type, rel.options);
    });
    await adapter.reset();
    const fields = adapter.getFields("ItemChild");
    expect(fields).toBeDefined();
    expect(fields.parentId).toBeDefined();
    expect(fields.parentId.foreignKey).toEqual(true);
    expect(fields.parentId.foreignTarget).toEqual("Item");
    expect(fields.parentId.type).toBeInstanceOf(Sequelize.INTEGER);
  });


  it("adapter - getFields - relationship not null foreign keys", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {
        "parentId": {
          type: Sequelize.INTEGER,
          comment: "This is the foreign key!",
          allowNull: false,
        },
      },
      relationships: [{
        type: "hasMany",
        model: "Item",
        name: "children",
        options: {
          as: "children",
          foreignKey: "parentId",
        },
      }, {
        type: "belongsTo",
        model: "Item",
        name: "parent",
        options: {
          as: "parent",
          foreignKey: "parentId",
        },
      }],
    };
    await adapter.createModel(itemDef);
    await waterfall(itemDef.relationships, async(rel) => {
      return adapter.createRelationship(itemDef.name, rel.model, rel.name, rel.type, rel.options);
    });
    await adapter.reset();
    const ItemFields = adapter.getFields("Item");
    expect(ItemFields).toBeDefined();
    expect(ItemFields.parentId).toBeDefined();
    expect(ItemFields.parentId.allowNull).toEqual(false);
    expect(ItemFields.parentId.foreignKey).toEqual(true);
    expect(ItemFields.parentId.foreignTarget).toEqual("Item");
    expect(ItemFields.parentId.description).toEqual(itemDef.define.parentId.comment);
    expect(ItemFields.parentId.type).toBeInstanceOf(Sequelize.INTEGER);
  });


  it("adapter - getFields - timestamp fields", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {
        "name": {
          type: Sequelize.STRING,
          comment: "This is the name!",
          defaultValue: "it",
          allowNull: false,
        },
      },
      relationships: [{
        type: "hasMany",
        model: "Item",
        name: "children",
        options: {
          as: "children",
          foreignKey: "parentId",
        },
      }, {
        type: "belongsTo",
        model: "Item",
        name: "parent",
        options: {
          as: "parent",
          foreignKey: "parentId",
        },
      }],
    };
    await adapter.createModel(itemDef);
    await waterfall(itemDef.relationships, async(rel) => {
      return adapter.createRelationship(itemDef.name, rel.model, rel.name, rel.type, rel.options);
    });
    await adapter.reset();
    const ItemFields = adapter.getFields("Item");
    expect(ItemFields).toBeDefined();
    expect(ItemFields.createdAt).toBeDefined();
    expect(ItemFields.createdAt.type).toBeInstanceOf(Sequelize.DATE);
    expect(ItemFields.createdAt.allowNull).toEqual(false);
    expect(ItemFields.createdAt.autoPopulated).toEqual(true);
  });



  it("adapter - getRelationships - hasMany", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {},
      relationships: [{
        type: "hasMany",
        model: "Item",
        name: "children",
        options: {
          as: "children",
          foreignKey: "parentId",
        },
      }, {
        type: "belongsTo",
        model: "Item",
        name: "parent",
        options: {
          as: "parent",
          foreignKey: "parentId",
        },
      }],
    };
    await adapter.createModel(itemDef);
    await waterfall(itemDef.relationships, async(rel) => {
      return adapter.createRelationship(itemDef.name, rel.model, rel.name, rel.type, rel.options);
    });
    await adapter.reset();
    const rels = adapter.getAssociations("Item");
    expect(rels).toBeDefined();
    expect(rels.parent).toBeDefined();
    expect(rels.parent.name).toEqual("parent");
    expect(rels.parent.target).toEqual("Item");
    expect(rels.parent.source).toEqual("Item");
    expect(rels.parent.associationType).toEqual("belongsTo");
    expect(rels.parent.foreignKey).toEqual("parentId");
    expect(rels.parent.targetKey).toEqual("id");
    expect(rels.parent.accessors).toBeDefined();
    expect(rels.parent.accessors.get).toBeDefined();
    expect(rels.parent.accessors.set).toBeDefined();
    expect(rels.parent.accessors.create).toBeDefined();
  });


  it("adapter - getRelationships - belongsTo", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {},
      relationships: [{
        type: "hasMany",
        model: "Item",
        name: "children",
        options: {
          as: "children",
          foreignKey: "parentId",
        },
      }, {
        type: "belongsTo",
        model: "Item",
        name: "parent",
        options: {
          as: "parent",
          foreignKey: "parentId",
        },
      }],
    };
    await adapter.createModel(itemDef);
    await waterfall(itemDef.relationships, async(rel) => {
      return adapter.createRelationship(itemDef.name, rel.model, rel.name, rel.type, rel.options);
    });
    await adapter.reset();
    const rels = adapter.getAssociations("Item");
    expect(rels).toBeDefined();
    expect(rels.children).toBeDefined();
    expect(rels.children.name).toEqual("children");
    expect(rels.children.target).toEqual("Item");
    expect(rels.children.source).toEqual("Item");
    // const childrenAssociation = rels.children.rel as Association
    // expect(childrenAssociation.associationType).toEqual("hasMany");
    // expect(childrenAssociation.foreignKey).toEqual("parentId");
    // expect(childrenAssociation.sourceKey).toEqual("id");
    // expect(childrenAssociation.accessors).toBeDefined();
    // expect(childrenAssociation.accessors.add).toBeDefined();
    // expect(childrenAssociation.accessors.addMultiple).toBeDefined();
    // expect(childrenAssociation.accessors.count).toBeDefined();
    // expect(childrenAssociation.accessors.create).toBeDefined();
    // expect(childrenAssociation.accessors.get).toBeDefined();
    // expect(childrenAssociation.accessors.hasAll).toBeDefined();
    // expect(childrenAssociation.accessors.hasSingle).toBeDefined();
    // expect(childrenAssociation.accessors.remove).toBeDefined();
    // expect(childrenAssociation.accessors.removeMultiple).toBeDefined();
    // expect(childrenAssociation.accessors.set).toBeDefined();
  });


  it("adapter - getDefaultListArgs", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {
        "name": {
          type: Sequelize.STRING,
          comment: "This is the name!",
          defaultValue: "it",
          allowNull: false,
        },
      },
      relationships: [],
    };
    await adapter.createModel(itemDef);
    const defaultArgs = adapter.getDefaultListArgs(itemDef.name, itemDef);
    expect(defaultArgs).toBeDefined();
    expect(defaultArgs.where).toBeDefined();
    // eslint-disable-next-line no-underscore-dangle
    // expect(defaultArgs.where.type).toEqual((adapter.sequelize.models[itemDef.name] as any)._gqlmeta.queryType);

  });

  it("adapter - include - getDefaultListArgs", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {
        "name": {
          type: Sequelize.STRING,
          comment: "This is the name!",
          defaultValue: "it",
          allowNull: false,
        },
      },
      relationships: [{
        type: "hasMany",
        model: "Item",
        name: "children",
        options: {
          as: "children",
          foreignKey: "itemId",
        },
      }, {
        type: "belongsTo",
        model: "Item",
        name: "parent",
        options: {
          as: "parent",
          foreignKey: "itemId",
        },
      }],
    };
    await adapter.createModel(itemDef);
    const defaultArgs = adapter.getDefaultListArgs(itemDef.name, itemDef);
    expect(defaultArgs).toBeDefined();
    expect(defaultArgs.where).toBeDefined();
    expect(defaultArgs.include).toBeDefined();
    expect(defaultArgs.include.type).toBeDefined();
    // eslint-disable-next-line no-underscore-dangle
    // expect(defaultArgs.where.type).toEqual((adapter.sequelize.models[itemDef.name] as any)._gqlmeta.queryType);
    expect(defaultArgs.include).toBeDefined();
  });

  it("adapter - hasInlineCountFeature - sqlite", async() => {
    const adapter = new SequelizeAdapter({
      disableInlineCount: false,
    }, {
      dialect: "sqlite",
    });
    const result = adapter.hasInlineCountFeature();
    expect(result).toEqual(true);
  });
  it("adapter - hasInlineCountFeature - disable inline count", async() => {
    const adapter = new SequelizeAdapter({
      disableInlineCount: true,
    }, {
      dialect: "sqlite",
    });
    const result = adapter.hasInlineCountFeature();
    expect(result).toEqual(false);
  });

  it("adapter - hasInlineCountFeature - postgres", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    }) as any;
    adapter.sequelize.dialect.name = "postgres";
    const result = adapter.hasInlineCountFeature();
    expect(result).toEqual(true);
  });

  it("adapter - hasInlineCountFeature - mssql", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    }) as any;
    adapter.sequelize.dialect.name = "mssql";
    const result = adapter.hasInlineCountFeature();
    expect(result).toEqual(true);
  });


  it("adapter - processListArgsToOptions - hasInlineCount", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {},
      relationships: [],
    };
    await adapter.createModel(itemDef);

    const {getOptions, countOptions} = await adapter.processListArgsToOptions("Item", {
      first: 1,
    });
    expect(countOptions).toBeUndefined();
    expect(getOptions).toBeDefined();
    expect(getOptions.limit).toEqual(1);
    expect(getOptions.attributes).toHaveLength(4);
    expect(getOptions.attributes[getOptions.attributes.length - 1]).toHaveLength(2);
    expect(getOptions.attributes[getOptions.attributes.length - 1][0].val).toEqual("COUNT(1) OVER()");
    expect(getOptions.attributes[getOptions.attributes.length - 1][1]).toEqual("full_count");
  });

  it("adapter - processListArgsToOptions - hasInlineCount - full_count args already exist", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const itemDef = {
      name: "Item",
      define: {},
      relationships: [],
    };

    await adapter.createModel(itemDef);
    const {getOptions, countOptions} = await adapter.processListArgsToOptions("Item", {
      first: 1,
    }, {
      attributes: [[
        adapter.sequelize.literal("COUNT(1) OVER()"),
        "full_count",
      ]],
    });
    expect(countOptions).toBeUndefined();
    expect(getOptions).toBeDefined();
    expect(getOptions.limit).toEqual(1);
    expect(getOptions.attributes).toHaveLength(4);
    expect(getOptions.attributes[getOptions.attributes.length - 1]).toHaveLength(2);
    expect(getOptions.attributes[getOptions.attributes.length - 1][0].val).toEqual("COUNT(1) OVER()");
    expect(getOptions.attributes[getOptions.attributes.length - 1][1]).toEqual("full_count");
  });

  it("adapter - processListArgsToOptions - hasInlineCount - mssql", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    }) as any;
    const itemDef = {
      name: "Item",
      define: {},
      relationships: [],
    };

    await adapter.createModel(itemDef);
    adapter.sequelize.dialect.name = "mssql";
    const {getOptions, countOptions} = await adapter.processListArgsToOptions("Item", {
      first: 1,
    });
    expect(countOptions).toBeUndefined();
    expect(getOptions).toBeDefined();
    expect(getOptions.limit).toEqual(1);
    expect(getOptions.attributes).toHaveLength(4);
    expect(getOptions.attributes[getOptions.attributes.length - 1]).toHaveLength(2);
    expect(getOptions.attributes[getOptions.attributes.length - 1][0].val).toEqual("COUNT(1) OVER()");
    expect(getOptions.attributes[getOptions.attributes.length - 1][1]).toEqual("full_count");
  });

  it("adapter - processListArgsToOptions - hasInlineCount - postgres", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    }) as any;
    adapter.sequelize.getDialect = () => "postgres";
    const itemDef = {
      name: "Item",
      define: {},
      relationships: [],
    };

    await adapter.createModel(itemDef);
    const {getOptions, countOptions} = await adapter.processListArgsToOptions("Item", {
      first: 1,
    });
    expect(countOptions).toBeUndefined();
    expect(getOptions).toBeDefined();
    expect(getOptions.limit).toEqual(1);
    expect(getOptions.attributes).toHaveLength(4);
    expect(getOptions.attributes[getOptions.attributes.length - 1]).toHaveLength(2);
    expect(getOptions.attributes[getOptions.attributes.length - 1][0].val).toEqual("COUNT(*) OVER()");
    expect(getOptions.attributes[getOptions.attributes.length - 1][1]).toEqual("full_count");
  });

  it("adapter - processListArgsToOptions - no inlineCount", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    }) as any;
    const itemDef = {
      name: "Item",
      define: {},
      relationships: [],
    };

    await adapter.createModel(itemDef);
    adapter.sequelize.getDialect = () => "unknown";
    const {getOptions, countOptions} = await adapter.processListArgsToOptions("Item", {
      first: 1,
    });
    expect(countOptions).toBeDefined();
    expect(countOptions.limit).toBeUndefined();
    expect(getOptions).toBeDefined();
    expect(getOptions.limit).toEqual(1);
    expect(getOptions.attributes).toHaveLength(3);
  });

  it("adapter - getTypeMapper", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    const typeMapper = adapter.getTypeMapper();
    expect(typeMapper).toBeDefined();
    expect(typeMapper).toBeInstanceOf(Function);
  });

  it("adapter - deleteFunction", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    await adapter.reset();
    const Task = adapter.getModel("Task");
    await Task.create({
      name: "ttttttttttttttt",
    });

    const func = await adapter.getDeleteFunction("Task", null);
    await func({}, {}, (i) => i, (i) => i);
    // const result = await proxyFunc();
    // expect(result).not.toBeUndefined();
    // expect(result).toHaveLength(1);
    // expect(result[0].id).toEqual(task.id);
    const result = await Task.findAll({
      where: {},
    });
    expect(result).toBeDefined();
    expect(result).toHaveLength(0);
  });



  it("adapter - processIncludeStatement", async() => {
    const adapter = new SequelizeAdapter({}, {
      dialect: "sqlite",
    });
    await adapter.createModel(TaskModel);
    await adapter.reset();
    const Task = adapter.getModel("Task");
    await Task.create({
      name: "ttttttttttttttt",
    });

    const results = await adapter.processIncludeStatement("Task", [], [["createdAt", "DESC"]]);
    expect(results.include).toBeDefined();
    expect(results.order).toHaveLength(1);
  });
});