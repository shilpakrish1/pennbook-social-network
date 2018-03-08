var express = require('express');
var LineByLineReader = require('line-by-line');
var router = express.Router();
var shorthash = require('shorthash');

async = require('async');
var db = require('../models/database.js');
const gf = require('../utils/generator_functions');

var fs = require('fs');

// getting a profile
router.get('/profile', function(req, res, next) {
	db.lookup('profiles', req.session.user, function (err, data) {
    if (err) {
      res.status(400).send("Error getting the profile: " + err);
    } else if (!data) {
      res.status(400).send("No data getting the profile: " + err);
    }
		else {
			var obj = JSON.parse(data[0]["value"]);
			res.render('profile', {userNotLoggedIn: !req.session.user, fullname: req.session.fullname, email: obj.email, birthday: obj.birthday,
				affiliation: obj.affiliation, interests: obj.interests})
		}
	});
})

// editing a profile (renders page)
router.get('/editprofile', function(req, res, next) {
	res.render('editprofile', {userNotLoggedIn: !req.session.user});
});

// editing a profile
router.post('/edit', function(req, res, next) {
	var values = JSON.stringify(req.body);
	console.log("Values: " + values);
	var toUpdate = {}
	if (req.body.email != "") toUpdate['email'] = req.body.email;
	if (req.body.affiliation != "") toUpdate['affiliation'] = req.body.affiliation;
	if (req.body.birthday != "") toUpdate['birthday'] = req.body.birthday;
	var value = JSON.stringify(toUpdate);
	db.edit_profile(req.session.user, value, function (data, err) {
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
			res.render('profile', {userNotLoggedIn: !req.session.user, fullname: req.session.fullname, email: email, birthday: birthday,
				affiliation: affiliation, interests: old.interests});
		} else {
			res.redirect('/profile')
		}
	});

  var prof_up_post_cb = function(resp) {
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

  var content_string = "User " + req.session.user + " edited their profile."
  if (toUpdate.hasOwnProperty('affiliation')) {
    content_string += "Their new affiliation is " + toUpdate['affiliation'] + "."
  }
  if (toUpdate.hasOwnProperty('birthday')) {
    content_string += "Their new birthday is " + toUpdate['birthday'] + "."
  }

  add_post(req.session.user, content_string, prof_up_post_cb)
});

// adding a new interest
router.post('/addinterest', function(req, res, next) {
	var newInterest = req.body.interest;
	var interests = []
	var id = "";
	var obj;
	db.lookup('profiles', req.session.user, function(err, data) {
		if (err) res.status(400).send(err);
		if (data) {
			obj = JSON.parse(data[0]["value"]).interests;
			id = JSON.parse(data[0]["value"]).userId;
			var str = obj + "," + newInterest;
			console.log("New interests list: " + str);
			var val = {}
			val['interests'] = str
			db.edit_profile(req.session.user, JSON.stringify(val), function(data, err) {
				if (err) res.status(400).send(err);
				if (data) {
					res.status(200).send(data[0]);
				}
			});
		}
	});
	db.add_interest('interests', newInterest, req.session.user, function(data, err) {});
});

// getting all interests
router.get('/getinterests', function (req, res, next) {
	db.lookup('profiles', req.session.user, function(err, data) {
		if (err) {
      res.status(400).send(err);
    } else {
			res.json({interests: data});
		}
	});
});

// helper function to add a post
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

// getting all friends for a user
router.get('/getfriends', function(req, res, next) {
	db.lookup('friends2', req.session.user, function(err, data) {
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

// getting friend recs for a user
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

router.get('/logout', function(req, res, next) {
	req.session.user = null;
	user = null;
	res.redirect('/login');
});

module.exports = router;
