module.exports = {
  generate_post_id: function() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); 
  }
 }
