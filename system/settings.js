
var Collection = require('../models/setting.model').Collection,
    model = require('../models/setting.model').model,
    Promise = require('promise').Promise;


var Settings = new Class({

    find: function(key, request, def, add) {

        add = !nil(add) ? add : false;

        var domain = request.domain,
            options = request.domainObj.getDbOptions(domain),
            parts = key.split('.'),
            opts = Object.clone(options),
            promise = new Promise(),
            ret = null;         
        var coll = this.coll = new Collection(domain, opts);
        var select = this.coll.getSelect();
            
            
    

        logger.debug('parts of key', parts);
        //find the setting we need
        select.query = {'module': parts[0] , settings: {"$elemMatch": { key: parts[1]}}};
        coll.init().then(function(){
            return coll.find(select, request);
        }).then(function(results){
            //logger.debug('doc found in setting.find', docs);
            results.each(function(d){
                d.settings.each(function(doc){
                    if (doc.key == parts[1]) {
                        ret = doc.value;
                    }
                });
            });
            if (nil(ret) && def) {
                ret = def;
            }
            promise.resolve(ret);
        },function(err){
            logger.debug('error in setting.find', err.message);
            if (add) {
                this.add(key, def, request);
            }
            promise.resolve(def);
        }.bind(this));
        return promise;
    },

    add: function(key, value, request) {
        var domain = request.domain,
            parts = key.split('.'),
            s = this.coll.getModel();

        //save this but delete it after the first run
        s.module = parts[0];
        s.settings = [];
        s.settings.push({key: parts[1], value: value});
        logger.debug('setting we\'re adding before saving',s);
        var promise = new Promise();
        s.save(request).then(function(result){
            logger.info('save successful');
            promise.resolve(true);
        }.bind(this),function(err){
            logger.debug('error on save', err);
            promise.reject('Could not save: ' + err.message);
        }.bind(this));
        return promise;
    }
});

exports.Settings = Settings;