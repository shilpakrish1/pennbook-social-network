/* This is a simple example of a program that creates the database and puts some
   initial data into it. You don't strictly need this (you can always edit the
   database using the DynamoDB console), but it may be convenient, e.g., when you
   need to reset your application to its initial state during testing. */

var AWS = require('aws-sdk');
AWS.config.loadFromPath('config.json');

var db = new AWS.DynamoDB();
var kvs = require('./models/keyvaluestore.js');

var async = require('async');

const gf = require('./utils/generator_functions');

/* Here is our initial data. */

var wordDBname = "messages";
var id = gf.generate_post_id();

var userObject = {
  "title": "hello",
  "content": "some content"
}
// var words = [
// [id,JSON.stringify(userObject)]
// ];

var words = [];

/* This function uploads our data. Notice the use of 'async.forEach'
   to do something for each element of an array... */

var uploadWords = function(table, callback) {
  async.forEach(words, function (word, callback) {
    console.log("Adding word: " + word[0]);
    table.put(word[0], word[1], function(err, data) {
      if (err)
        console.log("Oops, error when adding "+word[0]+": " + err);
    });
  }, callback);
}

/* This function does the actual work. Since it needs to perform blocking
   operations at various points (create table, delete table, etc.), it
   somewhat messily uses itself as a callback, along with a counter to
   distinguish which part of the function is called. In other words, 'i'
   starts out being 0, so the first thing the function does is delete the
   table; then, when that call returns, 'i' is incremented, and the
   function creates the table; etc. */

var i = 0;

function setup(err, data) {
  i++;
  if (err && i != 2) {
    console.log("Error: " + err);
  } else if (i==1) {
    console.log("Deleting table "+wordDBname+" if it already exists...");
    params = {
        "TableName": wordDBname
    }
    db.deleteTable(params, function(){
      console.log("Waiting 10s for the table to be deleted...")
      setTimeout(setup,40000) // this may not be enough - increase if you're getting errors
    })
  } else if (i==2) {
    console.log("Creating table "+wordDBname+"...");
    table = new kvs(wordDBname)
    table.init(setup)
  } else if (i==3) {
    console.log("Waiting 10s for the table to become active...")
    setTimeout(setup,40000) // this may not be enough - increase if you're getting errors
  } else if (i==4) {
    console.log("Uploading")
    uploadWords(table, function(){
      console.log("Done uploading!")
    });
  }
}

/* So far we've only defined functions - the line below is the first line that
   is actually executed when we start the program. */

setup(null,null);
