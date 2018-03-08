/**
 * Very simple String-based key/value store interface for
 * instructional purpose.  Supports both singleton and
 * multivalued (set) values for individual keys.
 * If multi-attribute values are used, they should be given as
 * JSON strings.

 * NB: this interface only supports tables with columns key (string), inx (int), value (string)
 * Tables with differing schemas must be handled differently
 *
 * @author Zack Ives, University of Pennsylvania, for NETS 212
 * @author Sudarshan Muralidhar, University of Pennsylvania, for NETS 212
 *
 */

(function() {
  var AWS = require('aws-sdk');
  var async = require('async');
  AWS.config.loadFromPath('./config.json');

  if (!AWS.config.credentials || !AWS.config.credentials.accessKeyId)
    throw 'Need to update config.json to specify your access key!';

  var db = new AWS.DynamoDB();

  function keyvaluestore(table) {
    this.inx = -1;

    this.LRU = require("lru-cache");

    this.cache = this.LRU({ max: 500 });

    this.tableName = table;
  };

  /**
   * Initialize the table
   * This *must* be called on a table before using any other methods!
   */
  keyvaluestore.prototype.init = function(callback) {
    var tableName = this.tableName;
    var initCount = this.initCount;
    var self = this;

    db.listTables(function(err, data) {
      if (err)
        console.log(err, err.stack);
      else {
        console.log("Connected to AWS DynamoDB");

        var tables = data.TableNames.toString().split(",");
        console.log("Tables in DynamoDB: " + tables);
        if (tables.indexOf(tableName) == -1) {
          console.log("Creating new table " + tableName);

          var params = {
              AttributeDefinitions:
                [ /* required */
                  {
                    AttributeName: 'keyword', /* required */
                    AttributeType: 'S' /* required */
                  },
                  {
                    AttributeName: 'inx', /* required */
                    AttributeType: 'N' /* required */
                  }
                ],
              KeySchema:
                [ /* required */
                  {
                    AttributeName: 'keyword', /* required */
                    KeyType: 'HASH' /* required */
                  },
                  {
                    AttributeName: 'inx', /* required */
                    KeyType: 'RANGE' /* required */
                  }
                ],
              ProvisionedThroughput: { /* required */
                ReadCapacityUnits: 1, /* required */
                WriteCapacityUnits: 1 /* required */
              },
              TableName: tableName /* required */
          };

          db.createTable(params, function(err, data) {
            if (err) {
              console.log(err)
            }
            else {
              self.inx = 0;
              callback()
            }
          });
        } else {
          self.initCount(callback);
        }
      }
    }
    );
  }

  /**
   * Gets the count of how many rows are in the table
   *
   */
  keyvaluestore.prototype.initCount = function(whendone) {
    var self = this;
    var params = {
        TableName: self.tableName,
        Select: 'COUNT'
    };

    db.scan(params, function(err, data) {
      if (err){
        console.log(err, err.stack);
      }
      else {
        self.inx = data.ScannedCount;

        console.log("Found " + self.inx + " indexed entries in " + self.tableName);
        whendone();
      }
    });

  }

  /**
   * Get result(s) by key
   *
   * @param search
   *
   * Callback returns a list of objects with keys "inx" and "value"
   */
  keyvaluestore.prototype.get = function(search, callback) {
    var self = this;
    if (self.inx === -1){
      callback("Error using table - call init first!", null)
      return
    }

    if (self.cache.get(search))
      callback(null, self.cache.get(search));
    else {
      var params = {
          KeyConditions: {
            keyword: {
              ComparisonOperator: 'EQ',
              AttributeValueList: [ { S: search} ]
            }
          },
          TableName: self.tableName,
          AttributesToGet: [ 'inx', 'value' ]
      };

      db.query(params, function(err, data) {
        if (err || data.Items.length == 0) {
          callback(err, null);
        } else {
          var items = [];
          for (var i = 0; i < data.Items.length; i++) {
            console.log("data in kvs", search);
            items.push({"inx": data.Items[i].inx.N, "value": data.Items[i].value.S, "key": search});
          }
          self.cache.set(search, items);
          callback(err, items);
        }
      });
    }
  };

  /**
   * Test if search key has a match
   *
   * @param search
   * @return
   */
  keyvaluestore.prototype.exists = function(search, callback) {
    var self = this;
    if (self.inx === -1){
      callback("Error using table - call init first!", null)
      return
    }

    if (self.cache.get(search))
      callback(null, self.cache.get(search));
    else
      self.get(search, function(err, data) {
        if (err)
          callback(err, null);
        else
          callback(err, (data == null) ? false : true);
      });
  };

  /**
   * Get result set by key prefix
   * @param search
   *
   * Callback returns a list of objects with keys "inx" and "value"
   */
  keyvaluestore.prototype.getPrefix = function(search, callback) {
    var self = this;
    if (self.inx === -1){
      callback("Error using table - call init first!", null)
      return
    }
    var params = {
        KeyConditions: {
          keyword: {
            ComparisonOperator: 'BEGINS_WITH',
            AttributeValueList: [ { S: search} ]
          }
        },
        TableName: self.tableName,
        AttributesToGet: [ 'value' ]
    };

    db.query(params, function(err, data) {
      if (err || data.Items.length == 0)
        callback(err, null);
      else {
        var items = [];
        for (var i = 0; i < data.Items.length; i++) {
          items.push({"inx": data.Items[i].inx.N, "value": data.Items[i].value.S});
        }
        callback(err, items);
      }
    });
  }

  /**
   * Add a key/value or key/valueset pair
   * @param keyword
   * @param value - either a value or an array of values
   * callback with inx of put
   */
  keyvaluestore.prototype.put = function(keyword, value, callback) {
    var self = this;
    if (self.inx === -1){
      callback("Error using table - call init first!", null)
      return
    }

    self.cache.del(keyword);

    tasks = []
    // Array?
    if (value.constructor === Array) {
      inxList = []
      for (var i = 0; i < value.length; i++) {
        var params = {
            Item: {
              "keyword": {
                S: keyword
              },
              "inx": {
                N: self.inx.toString()
              },
              value: {
                S: value[i]
              }
            },
            TableName: self.tableName,
            ReturnValues: 'NONE'
        };

        tasks.push(function (callback){
          db.putItem(params, callback);
        })

        inxList.push(self.inx)
        self.inx++;
      }
      async.parallel(tasks, function(err, data){
        if (err)
          callback(err)
        else
          callback(null, inxList)
      })
    } else {
      var params = {
          Item: {
            "keyword": {
              S: keyword
            },
            "inx": {
              N: self.inx.toString()
            },
            value: {
              S: value
            }
          },
          TableName: self.tableName,
          ReturnValues: 'NONE'
      };

      db.putItem(params, function(err, data){
        if (err)
          callback(err)
        else
          callback(null, self.inx)
      });
      self.inx++;
    }
  };

  /**
   * Delete value matching the keyword and inx
   *
   * @param keyword
   * @param inx
   * callback with value of entry that was deleted
   */
  keyvaluestore.prototype.remove = function(keyword, inx, callback) {
    var self = this;
    if (self.inx === -1){
      callback("Error using table - call init first!", null)
      return
    }

    self.cache.del(keyword);
    var params = {
        "Key": {
          "keyword": {
            S: keyword
          },
          "inx": {
            N: inx
          }
        },
        TableName: self.tableName,
        ReturnValues: 'ALL_OLD'
    };

    db.deleteItem(params, function(err, data){
      if (err || !data.Attributes){
        if (!err)
          err = "No such item " + keyword + " " + inx
        callback(err, null);
      }
      else{
        callback(null, data.Attributes.value.S);
      }
    });
  };

  /**
   * Gets all of the keys by performing a scan.
   * Keys will always be treated as strings.
   *
   * Callback with a list of objects with keys "key", "inx"
   */
  keyvaluestore.prototype.scanKeys = function(callback) {
    var self = this;
    //modified to return values as well
    var params = {
        TableName: self.tableName,
        AttributesToGet: ['keyword', 'value', 'inx']
    };

    db.scan(params, function(err, data) {
      var values = [];

      if (!err) {
        for (var i = 0; i < data.Count; i++) {
          values.push({
            "key": data.Items[i].keyword['S'],
            "value": data.Items[i].value['S'],
            "inx": data.Items[i].inx['N']
          });
        }
      }

      callback(err, values);
    });
  };

  /**
   * Update value matching the keyword and inx
   * Assumes that the existing value is a JSON string!
   *
   * @param keyword
   * @param inx
   * @param attributes - dictionary of attributes to update
   */
  keyvaluestore.prototype.update_value = function(keyword, inx, attributes, callback) {
    var self = this;
    if (self.inx === -1){
      console.log("Error using table - call init first!");
      callback("Error using table - call init first!", null)
      return
    }
    console.log("Updating :", keyword, inx, attributes);
    self.remove(keyword, inx, function(err, data){
      console.log("Attribbutes in kvs: ", attributes, typeof attributes);
      if (err) {
        console.log("Err is in error handler: ", keyword, inx, attributes)
        callback(err, null);
      }
      else {
        // data = JSON.parse(data)
        // for (var attr in attributes) {
        //   data[attr] = attributes[attr];
        // }
        var params = {
            Item: {
              "keyword": {
                S: keyword
              },
              "inx": {
                N: inx.toString()
              },
              "value": {
                S: attributes
              }
            },
            TableName: self.tableName,
            ReturnValues: 'NONE'
        };
        console.log("params of: ", params['Item']['value'])
        db.putItem(params, callback);
      }
    })
  };


  /**
   * Update entry matching the keyword and inx
   * Assumes that the existing value is a JSON string!
   *
   * @param keyword
   * @param inx
   * @param attributes - dictionary of attributes to update
   */
  keyvaluestore.prototype.update = function(keyword, inx, attributes, callback) {
    var self = this;
    if (self.inx === -1){
      console.log("Error using table - call init first!");
      callback("Error using table - call init first!", null)
      return
    }
    console.log("Updating :", keyword, inx, attributes);
    self.remove(keyword, inx, function(err, data){
      console.log("Attribbutes in kvs: ", attributes, typeof attributes);
      if (err) {
        console.log("Err is in error handler: ", keyword, inx, attributes)
        callback(err, null);
      }
      else {
        data = JSON.parse(data)
        for (var attr in attributes) {
          data[attr] = attributes[attr];
        }
        var params = {
            Item: {
              "keyword": {
                S: keyword
              },
              "inx": {
                N: inx.toString()
              },
              "value": {
                S: JSON.stringify(data)
              }
            },
            TableName: self.tableName,
            ReturnValues: 'NONE'
        };
        console.log("params of: ", params['Item']['value'])
        db.putItem(params, callback);
      }
    })
  };

  module.exports = keyvaluestore;
}());
