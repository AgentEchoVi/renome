const EventEmitter = require('events');
const orderEmitter = new EventEmitter();
orderEmitter.setMaxListeners(50);
module.exports = orderEmitter;
