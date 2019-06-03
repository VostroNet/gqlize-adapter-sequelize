# gqlize-adapter-sequelize

This is a sequelize adapter for the graphql relational databinder [gqlize](https://github.com/VostroNet/gqlize) 

## Install

```
yarn add @vostro/gqlize @vostro/gqlize-adapter-sequelize @vostro/graphql-types graphql-sequelize
```

## License

This repository generally is covered by GPL-3.0 unless specified


## TODO
- Setup Documentation
- phase out the remaining imports of graphql-sequelize
- change where/filter object for sequelize adapter to typed object 
- implement includes
- test if model has a defaultValue is a 0 value, it sets the field as autoPopulated
- Write more unit tests

## Contributers

- Mick Hansen (Not a direct contributor, but I used alot of his code from graphql-sequelize as a reference and blatantly copied some)
- Lousie Apostol
- Matthew Mckenzie
