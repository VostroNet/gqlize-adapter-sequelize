import Sequelize, {Op} from "sequelize";
import { SequelizeDefinition } from '../../../src/types/index';
export default {
  name: "TaskItem",
  define: {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
      validate: {
        isAlphanumeric: {
          msg: "Your task item name can only use letters and numbers",
        },
        len: {
          args: [8, 50],
          msg: "Your task item name must be between 8 and 50 characters",
        },
      },
    },
  },
  relationships: [{
    type: "belongsTo",
    model: "Task",
    name: "task",
    options: {
      foreignKey: "taskId",
    },
  }],
  expose: {
    instanceMethods: {
      query: {
        testInstanceMethodArray: {
          type: "TaskItem[]",
          args: {},
        },
        testInstanceMethodSingle: {
          type: "TaskItem",
          args: {},
        },
      },
    },
    classMethods: {
      query: {
        getTaskItemsArray: {
          type: "TaskItem[]",
          args: {},
        },
        getTaskItemsSingle: {
          type: "TaskItem",
          args: {},
        },
      },
      mutations: {
        getTaskItemsArray: {
          type: "TaskItem[]",
          args: {},
        },
        getTaskItemsSingle: {
          type: "TaskItem",
          args: {},
        },
      },
    },
  },
  options: {
    tableName: "task-items",
    instanceMethods: {
      testInstanceMethodArray(args: any, {instance}: any) {
        return instance.models.TaskItem.findAll();
      },
      testInstanceMethodSingle(args: any, {instance}: any) {
        return instance.models.TaskItem.findOne({where: {id: 1}});
      },
    },
    classMethods: {
      getTaskItemsArray(args: any, {instance}: any) {
        return instance.models.TaskItem.findAll();
      },
      getTaskItemsSingle(args: any, {instance}: any) {
        return instance.models.TaskItem.findOne({where: {id: 1}});
      },
    },
    hooks: {
      beforeFind(options: any = {}) {
        if (options.getGraphQLArgs) {
          const graphqlArgs = options.getGraphQLArgs();
          if (graphqlArgs.info.rootValue) {
            const {filterName} = graphqlArgs.info.rootValue;
            if (filterName) {
              options.where = {
                name: {
                  [Op.ne]: filterName,
                },
              };
            }
          }
        }
        return options;
      },
      beforeCreate(instance: any, options: any, cb: any) {
        return undefined;
      },
      beforeUpdate(instance: any, options: any, cb: any) {
        return undefined;
      },
      beforeDestroy(instance: any, options: any, cb: any) {
        return undefined;
      },
    },
    indexes: [
      {unique: true, fields: ["name"]},
    ],
  },
} as SequelizeDefinition;
