var express = require('express');
var LineByLineReader = require('line-by-line');
var router = express.Router();
var sha256 = require('js-sha256');
var shorthash = require('shorthash');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('config.json');
var s3 = new AWS.S3();
var bucketParams = {Bucket: 'image_bucket'};
s3.createBucket(bucketParams)
async = require('async');
var db = require('../models/database.js');
const gf = require('../utils/generator_functions');
var name;
var user;

var fs = require('fs');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { userNotLoggedIn: !req.session.user });
});

router.get('/about', function(req, res, next) {
  res.render('about', {userNotLoggedIn: !req.session.user});
})

router.get('/signup', function(req, res, next) {
  res.render('signup', { userNotLoggedIn: !req.session.user});
})

router.post('/createaccount', function(req, res, next) {
	var fullname = req.body.fullname;
	var username = req.body.username;
	var id = shorthash.unique(username);
	var password = sha256(req.body.password);
	db.add_user(username, id, password, fullname, function(data, err) {
		if (err) res.render('signup', { userNotLoggedIn: !req.session.user, message: "Error signing up."});
		else if (data) {
			req.session.user = username;
			name = fullname;
			user = username;
			res.redirect('/feed');
		} else {
			res.render('signup', {userNotLoggedIn: !req.session.user, message: 'Signup not valid. User already exists.'});
		}
	});
});

router.get('/login', function(req, res, next) {
  console.log("Logging in...");
	res.render('login', { userNotLoggedIn: !req.session.user });
})

router.post('/checklogin', function(req, res, next) {
	var username = req.body.username;
	var password = sha256(req.body.password);
	db.lookup('users', username, function(err, data) {
		if (err) res.render('login', { userNotLoggedIn: !req.session.user, message: 'Error occurred.' });
		else if (data) {
			var pswd = JSON.parse(data[0]["value"]);
      console.log("pswd: ", pswd);
			if (pswd.password == password) {
				name = pswd.fullname;
				user = username;
        req.session.user = username;
        req.session.fullname = pswd.fullname;
        req.session.save(function(err) {
          res.redirect('/feed');
        })
			} else {
				res.render('login', { userNotLoggedIn: !req.session.user, message: 'Incorrect password or username.'});
			}
		} else {
			res.render('login', { userNotLoggedIn: !req.session.user, message: 'Incorrect password or username.'});
		}
	});
});


// middleware to bounce unlogged in users
router.use(function(req, res, next) {
  if (!req.session.user) {
    console.log("req.user", req.session.user)
    res.redirect('/login');
  } else {
    next();
  }
})

router.get('/feed', function(req, res, next) {
  res.render('feed', {userNotLoggedIn: !req.session.user, fullname: req.session.fullname, user: req.session.user})
})

// router.post('/image', function(req, res, next) {
//   var data = {Key: imageName, Body: imageFile};
//   s3Bucket.putObject(data, function(err, data){
//     if (err)
//       { console.log('Error uploading data: ', data);
//       } else {
//         console.log('succesfully uploaded the image!';
//       }
//   });
// })

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

router.get('/profile', function(req, res, next) {
	db.lookup('profiles', user, function (err, data) {
    if (err) {
      res.status(400).send("Error getting the profile: " + err);
    } else if (!data) {
      res.status(400).send("No data getting the profile: " + err);
    }
		else {
			var obj = JSON.parse(data[0]["value"]);
			res.render('profile', {userNotLoggedIn: !req.session.user, fullname: name, email: obj.email, birthday: obj.birthday,
				affiliation: obj.affiliation, interests: obj.interests})
		}
	});
})

//opens no specific chat
router.get('/chat', function(req, res, next) {
  res.render('messenger', {userNotLoggedIn: !req.session.user})
})

//opens an actual chat
router.get('/chat/:id', function(req, res, next) {
  var callback = function(err, chats) {
    if (err) {
      next(err);
    } else {
      var has_no_chats = true;
      console.log("chats: ", chats);

      if (chats) {
        for (var chat of chats) {
          console.log("Chat: ", chat.value);
          var prsd = JSON.parse(chat.value);
          console.log("chats info: ", prsd.to, req.params.id, typeof prsd.to, typeof req.params.id, prsd.to === req.params.id)
          if (prsd.to === req.params.id || chat.key === req.params.id) {
            has_no_chats = false;
          }
        }
      }

      if (!chats || has_no_chats) {
        var add_chat_callback = function(err, data) {
          if (err) {
            res.status(400).send("Error adding chat: " + err);
          } else {
            var add_chat_second_callback = function(err, data) {
              console.log("ChatId1: ", chatId);
              res.render('messenger', {userNotLoggedIn: !req.session.user, 'messages': [], 'user': req.session.user, 'recipient': req.params.id, 'chatId': chatId});
            }

            db.add_key_value('chats', req.params.id, JSON.stringify({
              'to': req.session.user,
              'chatId': chatId
            }), add_chat_second_callback);
          }
        }

        var chatId = gf.generate_post_id();
        db.add_key_value('chats', req.session.user, JSON.stringify({
          'to': req.params.id,
          'chatId': chatId
        }), add_chat_callback);
      } else {
        var chat_id_callback = function(err, data) {
          if (err) {
            res.status(400).send(err);
          } else {
            var chatId;
            console.log('data', data);
            if(!data) {data = []};
            for (var chat of data) {
              var prsd = JSON.parse(chat.value);
              if (prsd.to === req.params.id || chat.key === req.params.id) {
                chatId = prsd.chatId;
              }
            }

            var messages_callback = function(err, data) {
              if (err) {
                res.status(400).send("Error getting messages: " + err);
              } else if (!data) {
                console.log("ChatId2: ", chatId);
                res.render('messenger', {userNotLoggedIn: !req.session.user, 'messages': [], 'user': req.session.user, 'recipient': req.params.id, 'chatId': chatId});
              } else {
                console.log("data before sort: ", data);
                data.sort(function(a, b) {
                  var prsdA = JSON.parse(a.value);
                  var prsdB = JSON.parse(b.value);
                  var dateA = new Date(prsdA.timeStamp);
                  var dateB = new Date(prsdB.timeStamp);
                  if (dateA > dateB) {
                    return 1;
                  } else if (dateB > dateA) {
                    return -1;
                  } else {
                    return 0;
                  }
                })

                //flatten each message
                for (var message of data) {
                  var prsd = JSON.parse(message.value);
                  message['from'] = prsd.from;
                  message['to'] = prsd.to;
                  message['content'] = prsd.content;
                  message['chatId'] = prsd.chatId;
                  message['timeStamp'] = prsd.timeStamp;
                }
                res.render('messenger', {userNotLoggedIn: !req.session.user, 'messages': data, 'user': req.session.user, 'recipient': req.params.id, 'chatId': chatId});
              }
            }

            db.lookup('messages', chatId, messages_callback);
          }
        }

        db.lookup('chats', req.session.user, chat_id_callback)
      }
    }
  };

  var userToSearch = req.session.user > req.params.id ? req.session.user : req.params.id;
  db.lookup('chats', userToSearch, callback);
})

router.post('/message', function(req, res, next) {
  var callback = function(err, data) {
    if (err) {
      res.status(400).send("Error saving message: " + err);
    } else {
      res.status(200).send("Message saved successfully");
    }
  }

  var from = req.body.from;
  var to = req.body.to;
  var content = req.body.content;
  var chatId = req.body.chatId;

  var messageObj = {
    'from': from,
    'to': to,
    'content': content,
    'chatId': chatId,
    'timeStamp': Date.now()
  };
  db.add_key_value('messages', chatId, JSON.stringify(messageObj), callback);
});

router.get('/groupchat/:id', function(req, res, next) {
  res.render('groupchat', {userNotLoggedIn: !req.session.user});
})

router.get('/messages', function(req, res, next) {
  var callback = function(err, data) {
    if (err) {
      res.status(400).send("Error retrieving messages: " + err);
    } else {
      res.json({'messages': data});
    }
  }
  var chatId = req.body.chatId;
  db.lookup('messages', chatId, callback);
})

router.get('/logout', function(req, res, next) {
	req.session.user = null;
	user = null;
	res.redirect('/login');
});

router.get('/editprofile', function(req, res, next) {
	res.render('editprofile', {userNotLoggedIn: !req.session.user});
});

router.post('/edit', function(req, res, next) {
	var values = JSON.stringify(req.body);
	console.log("Values: " + values);
	var toUpdate = {}
	if (req.body.email != "") toUpdate['email'] = req.body.email;
	if (req.body.affiliation != "") toUpdate['affiliation'] = req.body.affiliation;
	if (req.body.birthday != "") toUpdate['birthday'] = req.body.birthday;
	var value = JSON.stringify(toUpdate);
	db.edit_profile(user, value, function (data, err) {
		if (err){
      next(err);
    }
		else if (data){
			var old = JSON.parse(data[0].value);
			console.log(old);
			var email = req.body.email === "" ? old.email : req.body.email;
			var birthday = req.body.birthday === "" ? old.birthday : req.body.birthday;
			var affiliation = req.body.affiliation === "" ? old.affiliation : req.body.affiliation;
			//db.add_affiliation(affiliation, user, function(data, err){})
			res.render('profile', {userNotLoggedIn: !req.session.user, fullname: name, email: email, birthday: birthday,
				affiliation: affiliation, interests: old.interests});
		} else {
			res.redirect('/profile')
		}
	});

  // var prof_up_post_cb = function(resp) {
  //   if (resp.err) {
  //     console.log("There was an error adding friendship post.", err);
  //   } else {
  //     if (!resp.data) {
  //       console.log("There was no data adding friendship post.");
  //     } else {
  //       console.log("Post added successfully");
  //     }
  //   }
  // }
  //
  // var content_string = "User " + req.session.user + " edited their profile."
  // if (toUpdate.hasOwnProperty('affiliation')) {
  //   content_string += "Their new affiliation is " + toUpdate['affiliation'] + "."
  // }
  // if (toUpdate.hasOwnProperty('birthday')) {
  //   content_string += "Their new birthday is " + toUpdate['birthday'] + "."
  // }
  //
  // add_post(req.session.user, content_string, prof_up_post_cb)
});

router.post('/addinterest', function(req, res, next) {
	var newInterest = req.body.interest;
	var interests = []
	var id = "";
	var obj;
	db.lookup('profiles', user, function(err, data) {
		if (err) res.status(400).send(err);
		if (data) {
			obj = JSON.parse(data[0]["value"]).interests;
			id = JSON.parse(data[0]["value"]).userId;
			var str = obj + "," + newInterest;
			console.log("New interests list: " + str);
			var val = {}
			val['interests'] = str
			db.edit_profile(user, JSON.stringify(val), function(data, err) {
				if (err) res.status(400).send(err);
				if (data) {
					res.status(200).send(data[0]);
				}
			});
		}
	});
	db.add_interest('interests', newInterest, user, function(data, err) {});
});

router.get('/getinterests', function (req, res, next) {
	db.lookup('profiles', user, function(err, data) {
		if (err) {
      res.status(400).send(err);
    } else {
			res.json({interests: data});
		}
	});
});

//friendship routes

var add_post = function(user, content, callback) {
  var user_post_callback = function(err, data) {
    if(err) {
      console.log("Error in add_post", err);
      return callback({'data': null, 'err': "Error looking up user posts: " + err});
    } else if (!data) {
      console.log("Got to no data");
      var id = gf.generate_post_id();
      var valueObj = {'content': content, 'creator': user, 'timeStamp': Date.now()};

      var add_post_text_cb = function(err, data) {
        if (err) {
          return callback({'data': null, 'err': "Error looking up user posts: " + err});
        } else {
          var user_post_callback_2 = function(err, data) {
            if (err) {
              return callback({'data': null, 'err': "Error looking up user posts: " + err});
            } else {
              return callback({'data': "post added", 'err': null});
            }
          }

          db.add_key_value('user_posts', user, JSON.stringify([id]), user_post_callback_2);
        }
      }
      db.add_key_value('post_text', id, JSON.stringify(valueObj), add_post_text_cb);
    } else {
      console.log("Got to yes data");
      var user_post_exists_callback = function(err, data) {
        if (err) {
          return callback({'data': null, 'err': "Error looking up user posts: " + err});
        } else {
          //add post text
          var valueObj = {'content': content, 'creator': user, 'timeStamp': Date.now()};
          var add_post_text = function(err, data) {
            if (err) {
              return callback({'data': null, 'err': "Error looking up user posts: " + err});
            } else {
              return callback({'data': "post added", 'err': null});
            }
          }

          db.add_key_value('post_text', id, JSON.stringify(valueObj), add_post_text);
        }
      }

      var id = gf.generate_post_id();
      var post_ids = JSON.parse(data[0].value);
      post_ids.push(id);
      console.log("Attributes : ", JSON.stringify({'value': post_ids}));
      db.update_key_value('user_posts', user, data[0].inx, JSON.stringify(post_ids), user_post_exists_callback);
    }
  }

  db.lookup('user_posts', user, user_post_callback);
}

//add a friendship between two users, adds to database as
//user1 user2
//user2 user1
router.post('/friendship', function(req, res, next) {
	var u = shorthash.unique(req.session.user);
	var f = shorthash.unique(req.body.friend);
  var callback = function(err, data) {
    if (err) {
      res.status(400).send("Error adding friend: " + err);
    } else {
      var callback2 = function(err, data) {
        if (err) {
          res.status(400).send("Error adding friend (inner): " + err);
        } else {
          res.status(200).send("Friendship successfully added");
        }
      }
      db.add_key_value("friends2", req.body.friend, req.session.user, function(){});
      db.add_key_value("friends", f, u, callback2);
    }
  };
  db.add_key_value("friends2", req.session.user, req.body.friend, function(){});
  db.add_key_value("friends", u, f, callback);
  var post_callback = function(resp) {
    if (resp.err) {
      console.log("There was an error adding friendship post.", err);
    } else {
      if (!resp.data) {
        console.log("There was no data adding friendship post.");
      } else {
        console.log("Post added successfully");
      }
    }
  }

  var content = "User " + req.session.user + " became friends with " + req.body.friend + ".";
  add_post(req.session.user, content, post_callback);

  var post_callback2 = function(resp) {
    if (resp.err) {
      console.log("There was an error adding friendship post.", err);
    } else {
      if (!resp.data) {
        console.log("There was no data adding friendship post.");
      } else {
        console.log("Post added successfully");
      }
    }
  }
  var content2 = "User " + req.body.friend + " became friends with " + req.session.user + ".";
  add_post(req.body.friend, content2, post_callback2);
})


// router.get('/friends', function(req, res, next) {
//   var callback = function(err, data) {
//     if (err) {
//       res.status(400).send("Error obtaining friends: " + err);
//     } else {
//       res.json({"friendships": data});
//     }
//   }
//
//   var friendToSearch;
//   if (req.body.user) {
//     friendToSearch = req.body.user;
//   } else {
//     friendToSearch = req.session.user;
//   }
//
//   db.get("friends", friendToSearch, callback);
// });

router.get('/getfriends', function(req, res, next) {
	db.lookup('friends2', user, function(err, data) {
		if (err);
		if (data) {
			var f = "";
			for (var i = 0; i < data.length; i++) {
				console.log("f: " + data[i].value);
				db.lookup('users', data[i].value, function(err, data) {
					if (data) {
						f = f + "," + JSON.parse(data[0].value).fullname;
					}
				})
			}
			res.json({friends: f});
		}
	});
});

router.get('/friendrecs', function(req, res, next) {
	console.log('getting friend recs for ' + req.session.user);
	var u = req.session.user;
	db.lookup('users', u, function(err, data) {
		if (err) {
			console.log(error);
		}
		if (data) {
			var id = JSON.parse(data[0].value).userId;
			db.lookup('friends', id, function(err, data) {
				if (err);
				if (data) {
					console.log(data);
					var friends = [];
					for (var i = 0; i < data.length; i++) {
						friends.push(data[i].value);
					}
					db.lookup('friendRecs', id, function(err, data) {
						if (data) {
							var recs = [];
							for (var j = 0; j < data.length; j++) {
								if (data[j].value != id) {
									recs.push(data[j].value);
								}
							}
							var difference = [];
							for (var i = 0; i < recs.length; i++) {
								if (friends.indexOf(recs[i]) == -1) {
									difference.push(recs[i]);
								}
							}
							var counter = 0;
							console.log(difference);
							var results = [];
							async.forEach(difference, function(data, callback) {
								console.log("my data is " + data);
								db.lookup('hash', data, function(err, data2) {
									counter++;
									console.log("data2 value is " + data2[0].value);
									if (data2[0].value != null) {
										console.log("pushing data " + data2[0].value);
										console.log("length" + results.length);
										results.push(data2[0].value);
									}
									if (counter == difference.length - 1) {
										console.log("results completed: " + results);
										res.json({recs: results});
									}
									//callback();
								});
							});
						}
					});
				}
			});
		}
	});
});

router.get('/export', function(req, res, next) {
	reader = new LineByLineReader("./data/AdsorptionExportData.txt");
	reader.on("error", function(err) {res.status(400).send("Error fetching data" + err)});
	reader.on("line", function(line) {
		reader.pause();
		setTimeout(function() {
			console.log(line);
			var currArray = line.split("\t")[0];
			console.log(currArray);
			var friends = currArray.split(" ");
			console.log(friends[2]);
			console.log(friends[3]);
			db.add_key_value("friendRecs",friends[2], friends[3], function(err, data){});
			reader.resume();
		}, 100);
	});
	reader.on("end", function() {
		res.status(200).send("File written successfully.");
		reader.close()});
});

router.get('/data', function(req, res, next) {
	  var callback = function(err, data) {
	    if (err) {
	      res.status(400).send("Error fetching data: " + err);
	    } else {
	      var stream = fs.createWriteStream("./data/data.txt");
	      stream.once('open', (fd) => {
	        for (var friendship of data) {
	          stream.write(friendship.key + "\t" + friendship.value + "\n");
	        }
	        res.status(200).send("File written successfully.");
	    });
	    }
	  }
	  db.get_all_keys('friends', callback);
	  var callback2 = function(err, data) {
		    if (err) {
		      res.status(400).send("Error fetching data: " + err);
		    } else {
		      var stream = fs.createWriteStream("./data/data2.txt");
		      stream.once('open', (fd) => {
		        for (var friendship of data) {
		          stream.write("?" + friendship.key + "\t" + JSON.parse(friendship.value).users + "\n");
		        }
		        stream.end();
		    });
		    }
		 }
	  var callback3 = function(err, data) {
		    if (err) {
		      res.status(400).send("Error fetching data: " + err);
		    } else {
		      var stream = fs.createWriteStream("./data/data3.txt");
		      stream.once('open', (fd) => {
		        for (var friendship of data) {
		          stream.write("?" + friendship.key + "\t" + JSON.parse(friendship.value).users + "\n");
		        }
		        stream.end();
		    });
		    }
		 }
	  db.get_all_keys('interests', callback2);
	  db.get_all_keys('affiliations', callback3);
});

//VISUALIZER

router.get('/friendvisualizer', function(req, res, next) {
	res.render('friendvisualizer');
})


var childNode = function(id) {
	user = {}
	user["id"] = id;
	var name;
	db.lookup('users', id, function(err, data) {
		if (data) {
			name = JSON.parse(data[0].value).fullname;
			console.log(name);
		}
	});
	user["name"] = name;
	user["data"] = {};
	user["children"] = [];
	console.log("created node: " + JSON.stringify(user));
	return user;
}

var createNode = function(parentid) {
	obj = {}
	obj["id"] = parentid;
	var name;
	db.lookup('users', parentid, function(err, data) {
		console.log("looking up" + data[0].value);
		if (data) name = JSON.parse(data[0].value).fullname;
	});
	obj["name"] = name;
	obj["data"] = {};
	var children = [];
	db.lookup('friends2', parentid, function(err, data) {
		if (data) {
			console.log(data);
			for (var i = 0; i < data.length; i++) {
				children.push(childNode(data[i].value));
			}
		}
	});
	obj["children"] = children;
	return obj;
}

router.get('/friendvisualization', function(req, res, next) {
	console.log('logged in as ' + req.session.user);
	var json = createNode(req.session.user);
	var o = {"id": "alice","name": "Alice","children": [{
        "id": "bob",
            "name": "Bob",
            "data": {},
            "children": [{
            	"id": "dylan",
            	"name": "Dylan",
            	"data": {},
            	"children": []
            }, {
            	"id": "marley",
            	"name": "Marley",
            	"data": {},
            	"children": []
            }]
        }, {
            "id": "charlie",
            "name": "Charlie",
            "data": {},
            "children": [{
                "id":"bob"
            }]
        }, {
            "id": "david",
            "name": "David",
            "data": {},
            "children": []
        }, {
            "id": "peter",
            "name": "Peter",
            "data": {},
            "children": []
        }, {
            "id": "michael",
            "name": "Michael",
            "data": {},
            "children": []
        }, {
            "id": "sarah",
            "name": "Sarah",
            "data": {},
            "children": []
        }],
        "data": []
    };
    res.send(json);
});


module.exports = router;
