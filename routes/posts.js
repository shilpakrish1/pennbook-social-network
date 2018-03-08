var express = require('express');
var router = express.Router();

var db = require('../models/database.js');
const gf = require('../utils/generator_functions');

// renders feed
router.get('/feed', function(req, res, next) {
  res.render('feed', {userNotLoggedIn: !req.session.user, fullname: req.session.fullname, user: req.session.user})
})

// makes a new post
router.post('/post', function(req, res, next) {
  var user_post_callback = function(err, data) {
    if(err) {
      res.status(400).send("Error looking up user posts: " + err);
    } else if (!data) {
      var id = gf.generate_post_id();
      var valueObj = {'content': req.body.content, 'creator': req.session.user, 'timeStamp': Date.now()};

      var callback = function(err, data) {
        if (err) {
          res.status(400).send(err);
        } else {
          var user_post_callback = function(err, data) {
            if (err) {
              res.status(400).send("Error adding post to user_posts: " + err);
            } else {
              res.status(200).send("Post added successfully.");
            }
          }

          db.add_key_value('user_posts', req.session.user, JSON.stringify([id]), user_post_callback);
        }
      }
      db.add_key_value('post_text', id, JSON.stringify(valueObj), callback);
    } else {
      var user_post_exists_callback = function(err, data) {
        if (err) {
          res.status(400).send("Error updating user_posts: " + err);
        } else {
          //add post text
          var valueObj = {'content': req.body.content, 'creator': req.session.user, 'timeStamp': Date.now()};
          var add_post_text = function(err, data) {
            if (err) {
              res.status(400).send("Error adding post text: " + err);
            } else {
              res.status(200).send("Post successfully added.");
            }
          }

          db.add_key_value('post_text', id, JSON.stringify(valueObj), add_post_text);
        }
      }

      var id = gf.generate_post_id();
      var post_ids = JSON.parse(data[0].value);
      post_ids.push(id);
      console.log("Attributes : ", JSON.stringify({'value': post_ids}));
      db.update_key_value('user_posts', req.session.user, data[0].inx, JSON.stringify(post_ids), user_post_exists_callback);
    }
  }

  db.lookup('user_posts', req.session.user, user_post_callback);
})

// get all posts for the current user's feed
router.get('/posts', function(req, res, next) {
  var friends_callback = function(err, data) {
    if (err) {res.status(400).send("Error pulling friends: " + err)}
    else {
      if (!data) {data = []};
      console.log("Data in friends_callback: ", data);
      var promises = [];
      var users = [req.session.user];

      for (var friend of data) {
        users.push(friend.value);
      }

      for (var friend of users) {
        promises.push(new Promise((resolve, reject) => {
          var post_callback = function(err, data) {
            if (err) {reject(err)}
            else {resolve(data)}
          }
          db.lookup('user_posts', friend, post_callback);
        }))
      }

      Promise.all(promises)
             .then(function(data) {
               if (!data) {data = [];}

               var flattened_ids = [];
               data = data.filter(function(n) {
                 return !!n;
               })
               console.log("Data in /posts: ", data);

               for (var user of data) {
                 var db_obj = user[0];
                 var post_ids = JSON.parse(db_obj['value']);
                 flattened_ids = flattened_ids.concat(post_ids);
               }

               var promises = [];
               for (var id of flattened_ids) {
                 promises.push(new Promise((resolve, reject) => {
                   var post_callback = function(err, data) {
                     if (err) {reject(err)}
                     else {resolve(data)}
                   }
                   db.lookup('post_text', id, post_callback);
                 }))
               }

               Promise.all(promises)
                      .then(function(data) {
                        if(!data) {data=[];}
                        data.filter(function(n) {
                          return n != undefined && n != null;
                        })
                        var flattened_posts = [];
                        for (var user of data) {
                          var db_obj = user[0];
                          var prsd = JSON.parse(db_obj['value']);
                          flattened_posts.push({'key': db_obj['key'], 'value': {
                            'content': prsd.content,
                            'creator': prsd.creator,
                            'timeStamp': prsd.timeStamp
                          }});
                        }
                        flattened_posts.sort(function(a, b) {
                          var aDate = new Date(a.value.timeStamp);
                          var bDate = new Date(b.value.timeStamp);
                          if (aDate > bDate) {return -1}
                          else if (aDate < bDate) {return 1}
                          else {return 0}
                        })
                        res.json({'posts':flattened_posts})
                      })
                      .catch(function(err) {
                        res.status(400).send("Error in fetching post text: " + err);
                      })
             })
             .catch(function(err) {
               res.status(400).send("Error in looking up posts: " + err);
             })
      }
    }

  db.lookup('friends2', req.session.user, friends_callback);
})

// get all posts a specific user has posted
router.get('/posts/:id', function(req, res, next) {
  var callback = function(err, data) {
    if (err) {
      res.status(400).send("Error in looking up posts: " + err);
    } else if (!data) {
      res.json({'posts': []});
    } else {
      var post_ids = JSON.parse(data[0].value);
      var promises = [];
      for (var id of post_ids) {
        promises.push(new Promise((resolve, reject) => {
          var post_callback = function(err, data) {
            if (err) {reject(err)}
            else {resolve(data)}
          }
          db.lookup('post_text', id, post_callback);
        }))
      }

      Promise.all(promises)
             .then(function(data) {
               res.json({'posts': data})
             })
             .catch(function(err) {
               res.status(400).send("Error fetching posts for user " + req.params.id + " :" + err);
             })
    }
  };

  db.lookup('user_posts', req.params.id, callback);
})


module.exports = router;
