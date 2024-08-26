import { Definition, DefinitionOptions } from '@vostro/gqlize/lib/types/index';
export interface SequelizeDefinitionOptions extends DefinitionOptions {
  tableName?: string;
}
export interface SequelizeDefinition extends Definition {
  tableName?: string;
  disablePrimaryKey?: boolean;
  removeAttributes?: { [key: string]: string }[];

  // classMethods?: {
  //   [key: string]: any;// SqlClassMethod | ((args: any, context: any) => any);
  // };
  instanceMethods?: {
    [key: string]: (this: any, args: any, context: any) => any;
  };
  queries?: any;
  options?: SequelizeDefinitionOptions
}

export interface SqlClassMethod {
  type?: string | undefined;
  schema?: string | undefined;
  functionName?: any;
  query?: any;
  modelName?: any;
  args?: any[] | undefined;
}