import Sequelize from "sequelize";
import { SequelizeDefinition } from '../../../src/types/index';

export default {
  name: "Item",
  tableName: "items",
  define: {
    id: {
      type: Sequelize.UUID,
      allowNull: false,
      unique: true,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4,
    },
    name: { type: Sequelize.STRING, allowNull: false },
  },
  relationships: [
    {
      type: "hasOne",
      model: "Item",
      name: "hasOne",
      options: { as: "hasOne", foreignKey: "hasOneId", sourceKey: "id" },
    },
    {
      type: "belongsTo",
      model: "Item",
      name: "belongsTo",
      options: { as: "belongsTo", foreignKey: "belongsToId", sourceKey: "id" },
    },
    {
      type: "hasMany",
      model: "Item",
      name: "children",
      options: { as: "children", foreignKey: "parentId", sourceKey: "id" },
    },
    {
      type: "belongsTo",
      model: "Item",
      name: "parent",
      options: { as: "parent", foreignKey: "parentId", sourceKey: "id" },
    },
    {
      type: "belongsTo",
      model: "Task",
      name: "task",
      options: { as: "task", foreignKey: "taskId", sourceKey: "id" },
    },
    {
      type: "belongsToMany",
      model: "Task",
      name: "btmTasks",
      options: {
        through: "btm-tasks",
        foreignKey: "itemId",
      },
    },
  ],
  options: {
    tableName: "items",
    hooks: {},
    classMethods: {},
    instanceMethods: {},
  },
  after({ result }) {
    if (!result) {
      return result;
    }
    // if ((result.edges || []).length > 0) {
    //   result.edges = result.edges.map((x) => {
    //     const {node} = x;
    //     return node.name !== "item-null" ? x : null;
    //   });
    //   return result;
    // }
    return result.name !== "item-null" ? result : null;
  },
} as SequelizeDefinition;
