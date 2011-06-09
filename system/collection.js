/**
 * The collection object used to access a database. This one is basically the
 * driver and is database specific. If you want to change the database you're
 * using you need to create a new one of these with the appropriate methods.
 */

var sys = require('sys'),
    p = require('path'),
    fs = require('fs-promise'),
    Promise = require('promise').Promise,
    Select = require('./select').Select,
    Model = require('./model').Model,
    Database = require('./database');

var Collection = exports.Collection = new Class({
    
    
    Implements: [Options],
    
    /**
     * Property: db
     * A mongodb database instance
     */
    db: null,
    
    collection: null,
    
    domain: null,
    /**
     * Property: model
     * The model to use with this collection. Defaults to the generic Model 
     * unless overridden in a subclass.
     */
    model: Model,
    
    initialize: function(domain, options){
        this.setOptions(options);
        this.domain = domain;
    },
    
    init: function(){
        var p = new Promise();
        core.log('in Collection.init()');
        Database.getDatabase(this.domain, this.options).then(function(db){
            core.log('got database in init');
            this.db = db;
            //get the collection object for this model
            db.collection(this.options.name, function(err,collection){
                if (err) {
                    core.log('error getting collection object');
                    core.log('rejecting promise');
                    p.reject(err);
                } else {
                    core.log('received collection in init()');
                    this.collection = collection;
                    core.log('resolving promise');
                    p.resolve(true);
                }
            }.bind(this));
        }.bind(this));
        return p;
    },
    
    getModel: function(obj) {
        var m = new this.model(obj, this);
        return m;
    },
    
    getSelect: function () {
        return new Select(this);
    },
    
    find: function(query, request){
        var p = new Promise();
        core.call('preCollectionFind',[query, request]).then(function(){
            this.collection.find(query.query,query.fields, query.options, function(err, cursor){
                if (err) {
                    p.reject(err);
                } else {
                    //loop through the results and create models
                    var results = [];
                    cursor.each(function(err,doc){
                        if (err) {
                            core.debug('error in cursor.each of find()',err);
                            throw err;
                        }
                        core.debug('doc in find',doc);
                        if (!nil(doc)) {
                            results.push(this.getModel(doc));
                        } else {
                            //core.debug('results returning from find()', results);
                            p.resolve(results);
                        }
                    }.bind(this));
                    
                }
            }.bind(this));
        }.bind(this));
        return p;
    },
    
    save: function(obj, request){
        var p = new Promise(),
            res = null;
        
        core.call('preModelSave',[obj, this]).then(function(){
            core.log('in callback from preModelSave');
            var p2 = new Promise();
            this.collection.save(obj,{safe:true},function(err,result){
                core.log('in callback from collection.save()');
                if (err) {
                    p2.reject(err);
                } else {
                    if (result == 1) {
                        res = obj;
                    } else {
                        res = result;
                    }
                    res = this.getModel(res);
                    p2.resolve(true);
               }
            }.bind(this));
            return p2;
        }.bind(this)).then(function(){
            return core.call('postModelSave', [res, this]);    
        }.bind(this)).then(function(){
            p.resolve(res);    
        });
        return p;
    },
    
    remove: function(obj){
        var p = new Promise();
        if (obj instanceof Select) {
            obj = obj.query;
        } else if (obj instanceof Model) {
            obj = obj.getObject();
        }
        this.collection.remove(obj, {safe:true}, function(err,results){
            if (err) {
                core.debug('error removing record',err);
                p.reject(err);
            } else {
                p.resolve(results);
            }
        });
        return p;
    },
    
    findOne: function(id, request){
        var p = new Promise(),
            self = this;
        core.call('preCollectionFindOne',[id,request]).then(function(){
            self.collection.findOne(id,function(err,doc){
                if (err) {
                    p.reject(err);
                } else {
                    core.debug('doc returned',doc);
                    p.resolve(self.getModel(doc));
                }
            });
        });
        return p;
    },
    
    /**
     * Translates expressions similar to 'field >= value' to the mongodb
     * object equivalent. 
     */
    translateExpression: function(expr,or) {
        var obj = {}, o = {}, parts, op, oper, part2, which, comp;
        //check for a range
        if ((expr.contains('<') || expr.contains('>')) && expr.match(/[<>]/g).length > 1) {
            //this is a range. 
            parts = expr.match(/^(.*?)([<>=]{1,2})(.*?)([<>=]{1,2})(.*)$/);
            
            core.debug('original expression', expr);
            core.debug('parts matched on range', parts);
            
            //remove index and input
            delete parts.index;
            delete parts.input;
            //throw away the first element
            parts.shift();
            
            core.debug('parts matched on range', parts);
            //put it together
            
            
            //logically the operators should be the same or at least similar.
            //they would pair as < and < (or one or more as <=) and then 
            //the opposite. if <, then the first operator will be gt(e) and 
            //the second as lt(e) otherwise the opposite
            if (['<','<='].contains(parts[1])){
                //the first one
                if (parts[1] == '<') {
                    op = '$gt';
                } else {
                    op = '$gte';
                }
                if (parts[3] == '<') {
                    oper = '$lt';
                } else {
                    oper = '$lte'
                }
            } else {
                //the second case
                //the first one
                if (parts[1] == '>') {
                    op = '$lt';
                } else {
                    op = '$lte';
                }
                if (parts[3] == '>') {
                    oper = '$gt';
                } else {
                    oper = '$gte'
                }   
            }
            core.debug('op',op);
            core.debug('oper',oper);
            var o = obj[parts[2].trim()] = {};
            o[op] = parts[0].trim();
            o[oper] = parts[4].trim();
            core.debug('final object',obj);
        } else {
            //not a range
            comp = this.determineComparator(expr);
            parts = expr.split(comp.oper);
            if (comp.op != '') {
                o[comp.op] = parts[1].trim();
            } else {
                o = parts[1].trim();
            }
            obj[parts[0].trim()] = o;
        }
        
        if (or) {
            var obj2 = { $or: [ obj ] };
            return obj2;
        } else {
            return obj;
        }
    },
    
    determineComparator: function(expr){
        //split expression in to component parts
        if (expr.contains('<=')) {
            oper = '<=';
            op = '$lte';
        } else if (expr.contains('>=')) {
            oper = '>=';
            op = '$gte';
        } else if (expr.contains('!=')) {
            oper = '!=';
            op = '$ne';
        } else if (expr.contains('>')) {
            oper = '>';
            op = '$gt';
        } else if (expr.contains('<')) {
            oper = '<';
            op = '$lt';
        } else if (expr.contains('=')) {
            oper = '=';
            op = '';
        } else {
            oper = '';
            op = '';
        }
        
        var obj = {oper: oper, op: op}; 
        core.debug('returned operators', obj);
        return obj;
    },
    
    close: function(){
        Database.close(this.domain);   
    }
        
});

