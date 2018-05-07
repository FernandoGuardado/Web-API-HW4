var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect(process.env.DB);

//Movie schema
var ReviewSchema = new Schema({
    username: { type: String, required: true },
    movietitle: { type: String, required: true },
    review: { type: String, required: true },
    rating: { type : Number ,  enum:[1,2,3,4,5] }
});


//return the model
module.exports = mongoose.model('Review', ReviewSchema);