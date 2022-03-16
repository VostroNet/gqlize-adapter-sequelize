import { Model } from 'sequelize';
interface ModelAttributeColumnOptions<M extends Model = Model> extends ColumnOptions {
  ignoreGlobalKey: boolean;
}

interface ModelCtor {
  relationships: any;
}