var keyvaluestore = require('../models/keyvaluestore.js');
var kvsPostText = new keyvaluestore('post_text');
kvsPostText.init(function(err, data){});
var kvsUsers = new keyvaluestore('users');
kvsUsers.init(function(err, data){});
var kvsProfiles = new keyvaluestore('profiles');
kvsProfiles.init(function(err, data){});
var kvsFriends = new keyvaluestore('friends');
kvsFriends.init(function(err, data){});
var kvsInterests = new keyvaluestore('interests');
kvsInterests.init(function(err, data) {});
var kvsAff = new keyvaluestore('affiliations');
kvsAff.init(function(err, data){});
var kvsChats = new keyvaluestore('chats');
kvsChats.init(function(err, data){});
var kvsMessages = new keyvaluestore('messages');
kvsMessages.init(function(err, data){});
var kvsUserPosts = new keyvaluestore('user_posts');
kvsUserPosts.init(function(err, data){});
var kvsFriends2 = new keyvaluestore('friends2');
kvsFriends2.init(function(err, data){});
var kvsHash = new keyvaluestore('hash');
kvsHash.init(function(err, data){});
var kvsFriendRecs = new keyvaluestore('friendrecs');
kvsFriendRecs.init(function(err, data){});

/* The function below is an example of a database method. Whenever you need to
   access your database, you should define a function (myDB_addUser, myDB_getPassword, ...)
   and call that function from your routes - don't just call DynamoDB directly!
   This makes it much easier to make changes to your database schema. */

var get_database_name = function(database_name) {
  var dbToUse;
  switch(database_name) {
    case 'post_text':
      dbToUse = kvsPostText;
      break;
    case 'users':
      dbToUse = kvsUsers;
      break;
    case 'profiles':
      dbToUse = kvsProfiles;
      break;
    case 'interests':
      dbToUse = kvsInterests;
      break;
    case 'friends':
        dbToUse = kvsFriends;
        break;
    case 'friends2':
        dbToUse = kvsFriends2;
        break;
    case 'chats':
        dbToUse = kvsChats;
        break;
    case 'messages':
        dbToUse = kvsMessages;
        break;
    case 'user_posts':
        dbToUse = kvsUserPosts;
        break;
    case 'affiliations':
    	dbToUse = kvsAff;
    	break;
    case 'hash':
    	dbToUse = kvsHash;
    	break;
    case 'friendRecs':
    	dbToUse = kvsFriendRecs;
    	break;
    default:
      console.log('Error thrown looking up keys for database: ', database_name);
      break;
  }
  return dbToUse;
}

var myDB_lookup = function(searchTerm, language, route_callbck){
  console.log('Looking up: ' + searchTerm);
  kvsWords.get(searchTerm, function (err, data) {
    if (err) {
      route_callbck(null, "Lookup error: "+err);
    } else if (data == null) {
      route_callbck(null, null);
    } else {
      route_callbck({ translation : data[0].value }, null);
    }
  });
};

// function to get all keys (and values and indexes) for a database
var get_all_keys = function(databaseName, route_callback) {
  console.log('Looking up keys for database: ', databaseName);
  var dbToUse = get_database_name(databaseName);

  if (!dbToUse) {
    route_callback("Error in looking up keys: database name incorrect.", null);
    return;
  }

  dbToUse.scanKeys(function(err, data) {
    if (err) {
      route_callback(err, null);
    } else {
      route_callback(null, data);
    }
  });
}


// function to look up the value for a particular key in a database
var lookup = function(databaseName, key, route_callback) {
  console.log('Looking up key: ', key, ' in database: ', databaseName);
  var dbToUse = get_database_name(databaseName);
  if (!dbToUse) {
	console.log("finding an error");
    route_callback("Error in lookup: database name incorrect.", null);
    return;
  }
  else {
	  dbToUse.get(key, function(err, data) {
		  console.log("looking up the data");
		  if (err) {
			  route_callback("Lookup error is " +  err, null);
		  }
	   console.log('Success looking up key: ', key, ' in database: ', databaseName);
	   route_callback(null, data);
	  });
  	}
}

// function to add a key and value pair to a particular database
var add_key_value = function(databaseName, key, value, route_callback) {
  console.log('Adding key: ', key, ' value: ', value, ' to database: ', databaseName);
  var dbToUse = get_database_name(databaseName);
  //make sure types are safe
  if (typeof key != 'string') {
    key = JSON.stringify(key);
  }
  if (typeof value != 'string') {
    value = JSON.stringify(value);
  }

  if (!dbToUse) {
    route_callback("Error in add_key_value: database name incorrect.", null);
    return;
  }

  dbToUse.put(key, value, function(err, inx) {
    if (err) {
      route_callback(err, "Adding key value error: " + err);
      console.log("Error: adding key didnt work", err);
      return null;
    }
    console.log('Success adding key: ', key, ' value: ', value, ' to database: ', databaseName);
    route_callback(null, inx);
  })
}

var update_key_value = function(databaseName, key, inx, attributes, route_callback) {
  console.log('Updating key: ', key, ' in database: ', databaseName, " with attributes: ", attributes);
  var dbToUse = get_database_name(databaseName);

  if (!dbToUse) {
    route_callback("Error in remove_key: database name incorrect.", null);
    return;
  }

  dbToUse.update_value(key, inx, attributes, function(err, success) {
    if (err) {
      route_callback(err, "Updating key value error: " + err);
      console.log("Error: updating key didnt work", err);
      return null;
    }
    console.log('Success updating key: ', key,' from database: ', databaseName);
    route_callback(null, key);
  })
};


var remove_key = function(databaseName, key, inx, route_callback) {
  console.log('Removing key: ', key, ' from database: ', databaseName);
  var dbToUse = get_database_name(databaseName);

  if (!dbToUse) {
    route_callback("Error in remove_key: database name incorrect.", null);
    return;
  }

  dbToUse.remove(key, inx, function(err, success) {
    if (err) {
      route_callback(err, "Removing key value error: " + err);
      console.log("Error: removing key dint work", err);
      return null;
    }
    console.log('Success removing key: ', key,' from database: ', databaseName);
    route_callback(null, key);
  })
};

var add_interest = function(db, interest, user, route_callbck) {
	kvsInterests.exists(interest, function (err, data) {
		if (err) route_callbck(null, err);
		if (data == false){
			// New interest
			var id = "";
			kvsUsers.get(user, function(err, data) {
				if (err) return;
				if (data) {
					var obj = JSON.parse(data[0].value).userId;
					id = obj;
				}
			})
			var v = JSON.stringify({users: id})
			console.log("id: " + id);
			kvsInterests.put(interest, v, function(){});
			route_callbck(data, null);
		} else {
			kvsInterests.get(interest, function (err, data) {
				if (err);
				if (data) {
					var inx = data[0].inx;
					var oldusers = JSON.parse(data[0].value).users;
					var id = "";
					kvsUsers.get(user, function(err, data) {
						if (err) return;
						if (data) {
							var obj = JSON.parse(data[0].value).userId;
							id = obj;
						}
					})
					var newVal = oldusers + "," + id;
					console.log("new val: " + newVal);
					kvsInterests.update(interest, inx, {users: newVal}, function(){});
					route_callbck(data, null);
				}
			})
		}
	});

}


var add_affiliation = function(affiliation, user, route_callbck) {
	kvsAff.exists(affiliation, function (err, data) {
		if (err) route_callbck(null, err);
		if (data == false){
			// New interest
			var id = "";
			kvsUsers.get(user, function(err, data) {
				if (err) return;
				if (data) {
					var obj = JSON.parse(data[0].value).userId;
					id = obj;
				}
			})
			var v = JSON.stringify({users: id})
			console.log("id: " + id);
			kvsAff.put(affiliation, v, function(){});
			route_callbck(data, null);
		} else {
			kvsAff.get(affiliation, function (err, data) {
				if (err);
				if (data) {
					var inx = data[0].inx;
					var oldusers = JSON.parse(data[0].value).users;
					var id = "";
					kvsUsers.get(user, function(err, data) {
						if (err) return;
						if (data) {
							var obj = JSON.parse(data[0].value).userId;
							id = obj;
						}
					})
					var newVal = oldusers + "," + id;
					console.log("new val: " + newVal);
					kvsAff.update(affiliation, inx, {users: newVal}, function(){});
					route_callbck(data, null);
				}
			})
		}
	});

}


var getUserID = function(username) {
	var v = ""
	kvsUsers.get(username, function(err, data) {
		if (err) return;
		if (data) {
			console.log(data);
			var obj = JSON.parse(data[0].value).userId;
			v = obj;
		}
	})
	return v;
}

var get_uid = function(username, route_callbck) {
	console.log("username: " + username);
	kvsUsers.get(username, function(err, data) {
		if (err) {
			console.log(err);
			route_callbck(err, null);
		}
		if (data) {
			console.log("returning id: " + SON.parse(data[0].value).userId);
			route_callbck(null, JSON.parse(data[0].value).userId);
		}
	})
}


var get_friend_recs = function(username, route_callbck) {
	var id = getUserId(username);
	console.log("id:" + id);
	kvsFriends.get(id, function(err, data) {
		if (err);
		if (data) {
			var friends = []
			console.log("myfriendsare " + data);
		}
	})
}

var addUser = function (username, id, password, fullname, route_callbck) {
	kvsUsers.exists(username, function (err, data) {
		console.log("add user data: " + data);
		if (err) route_callbck("Lookup error: " + err, null);
		else if (data == false) {
			//User doesn't exist yet
			value = JSON.stringify({userId: id, password: password, fullname: fullname});
			kvsUsers.put(username, value, function () {});
			pValue = JSON.stringify({email: "", birthday: "", affiliation: "", interests: ""})
			kvsProfiles.put(username, pValue, function(){});
			kvsHash.put(id, username, function(){});
			// kvsFriends.put(id, "", function(){});
			route_callbck(1, null);
		}
		else {
			// User already exists
			console.log("user already exists");
			route_callbck("Error: user already exists", null);
		}
	});
};

var edit_profile = function (username, value, route_callbck){
	kvsProfiles.get(username, function(err, data) {
		if (err) console.log("err");
		if (data) {
      console.log("Data came back in edit profile", data);
			var inx = data[0].inx;
			kvsProfiles.update(username, inx, JSON.parse(value), function(){});
			route_callbck(data, null);
		}
	});
};

var add_affiliation = function(affiliation, user, route_callbck) {
	kvsAff.exists(affiliation, function (err, data) {
		if (err) route_callbck(null, err);
		if (data == false){
			// New User for an affiliation
			var id = "";
			kvsUsers.get(user, function(err, data) {
				if (err) return;
				if (data) {
					var obj = JSON.parse(data[0].value).userId;
					id = obj;
				}
			})
			var v = JSON.stringify({users: id})
			console.log("id: " + id);
			kvsAff.put(affiliation, v, function(){});
			route_callbck(data, null);
		} else {
			kvsAff.get(affiliation, function (err, data) {
				if (err);
				if (data) {
					var inx = data[0].inx;
					var oldusers = JSON.parse(data[0].value).users;
					var id = "";
					kvsUsers.get(user, function(err, data) {
						if (err) return;
						if (data) {
							var obj = JSON.parse(data[0].value).userId;
							id = obj;
						}
					})
					var newVal = oldusers + "," + id;
					console.log("new val: " + newVal);
					kvsAff.update(affiliation, inx, {users: newVal}, function(){});
					route_callbck(data, null);
				}
			})
		}
	});

}


var get_uid = function(user, route_callbck) {
	kvsUsers.get(user, function(err, data) {
		if (err);
		if (data) {
			var id = JSON.parse(data[0].value).userId;
			console.log("id: " + id);
			route_callbck(null, id);
		}
	});
}

var database = {
  lookup: lookup,
  add_key_value: add_key_value,
  get_all_keys: get_all_keys,
  remove_key: remove_key,
  add_user: addUser,
  edit_profile: edit_profile,
  add_interest: add_interest,
  add_affiliation: add_affiliation,
  update_key_value: update_key_value,
  get_uid: get_uid,
  get_friend_recs: get_friend_recs
};

module.exports = database;
