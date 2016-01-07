module.exports = function (PersistObjectTemplate) {

    var Q = require('q');

    PersistObjectTemplate.setSchema = function (schema) {
        this._schema = schema;
    }

    /**
     * Run through the schema entries and setup these properites on templates
     *  __schema__: the schema for each template
     *  __collection__: the name of the Mongo Collection
     *  __topTemplate__: for a template that represents a subDocument the template that is primary for that colleciton
     * @private
     */
    PersistObjectTemplate._verifySchema = function ()
    {
        var schema = this._schema;

        // Helper to get the base class walking the __parent__ chain
        function getBaseClass(template) {
            while (template.__parent__)
                template = template.__parent__
            return template;
        }

        // Establish a hash of collections keyed by collection name that has the main template for the collection
        var collections = {};
        for (var templateName in schema) {
            var template = this.getTemplateByName(templateName);
            if (template && schema[templateName].documentOf) {

                if (collections[schema[templateName].documentOf] &&
                    collections[schema[templateName].documentOf] != getBaseClass(template))
                    throw new Error(templateName + " and " + collections[schema[templateName].documentOf]._name +
                        " are both defined to be top documents of " + schema[templateName].documentOf);
                collections[schema[templateName].documentOf] = getBaseClass(template);
            }
        }

        // For any templates with subdocuments fill in the __topTemplate__
        for (var templateName in schema) {
            var template = this.getTemplateByName(templateName)
            if (template && schema[templateName].subDocumentOf)
                template.__topTemplate__ = collections[schema[templateName].subDocumentOf];
        }

        // Fill in the __schema__ and __collection properties
        for (var templateName in this._schema) {
            var template = this.__dictionary__[templateName];
            if (template) {
                template.__schema__ = this._schema[template.__name__];
                template.__collection__ = template.__schema__ ?
                    template.__schema__.documentOf || template.__schema__.subDocumentOf || template.__name__ : null;
                if (template.__schema__ && template.__schema__.table)
                    template.__table__ = template.__schema__.table;
                var parentTemplate = template.__parent__;

                var defaultTable = template.__schema__ ? template.__schema__.documentOf || template.__schema__.subDocumentOf || template.__name__ : null;

                // Inherit foreign keys and tables from your parents
                while (parentTemplate) {
                    var schema = parentTemplate.__schema__;
                    if (schema && schema.children) {
                        if (!template.__schema__)
                            template.__schema__ = {};
                        if (!template.__schema__.children)
                            template.__schema__.children = [];
                        for (var key in schema.children)
                            template.__schema__.children[key] = schema.children[key];
                    }
                    if (schema && schema.parents) {
                        if (!template.__schema__)
                            template.__schema__ = {};
                        if (!template.__schema__.parents)
                            template.__schema__.parents = [];
                        for (var key in schema.parents)
                            template.__schema__.parents[key] = schema.parents[key];
                    }

                    var defaultTable = schema ? schema.documentOf || schema.subDocumentOf || parentTemplate.__name__ : defaultTable;
                    parentTemplate = parentTemplate.__parent__;
                }
                template.__table__ = template.__schema__ ? template.__schema__.table || defaultTable : defaultTable;
            }
        }

    }
    PersistObjectTemplate.isCrossDocRef = function (template, prop, defineProperty)
    {
        var schema = template.__schema__;
        var type = defineProperty.type;
        var of = defineProperty.of;
        var refType = of || type;
        if (!schema)  // No schema no persistor
            return false;

        if (refType && refType.__name__ && !refType.__schema__  && this._persistProperty(defineProperty))
            throw new Error("Missing schema entry for " + refType.__name__);

        var collection = template.__table__ || template.__collection__;
        var childrenRef = schema && schema.children && schema.children[prop];
        var parentsRef = schema && schema.parents && schema.parents[prop];
        var crossChildren = schema && schema.children && schema.children[prop]  && schema.children[prop].crossDocument;
        var crossParent = schema && schema.parents && schema.parents[prop] && schema.parents[prop].crossDocument;
        return (of && of.__collection__ && (((of.__table__ || of.__collection__) != collection) || (childrenRef && crossChildren))) ||
            (type && type.__collection__ && (((type.__table__ || type.__collection__) != collection) || (parentsRef && crossParent)));

    }

}