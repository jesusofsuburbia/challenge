var assert = require('assert');

var esp32CoAP = require('../modules/esp32CoAP.js')

var coap = new esp32CoAP()

describe('parsePayloadValue', function() {
  it('should return the value of the payload string as number', function() {
    assert.equal(coap.parsePayloadValue("23.5F", "F"), 23.5);
    assert.equal(coap.parsePayloadValue("23.5C", "C"), 23.5);
    assert.equal(coap.parsePayloadValue("50%", "%"), 50);
    assert.notEqual(coap.parsePayloadValue("50.1%", "%"), 50);
  });
});


describe('parseResource', function() {
  it('should parse the resource correctly', function() {

    var exampleResource = {
      uri: 'temperature',
      attributes: {
        resourceType: 'temperature-c',
        interfaceDescription: 'sensor',
        maximumSizeEstimate: '8'
      }
    }    
    assert.deepEqual(coap.parseResource('</temperature>;rt="temperature-c";if="sensor";sz="8"', "F"), exampleResource);
  });
});