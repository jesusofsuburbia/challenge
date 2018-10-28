var coap = require('coap')

var EventEmitter = require('events')


var CoRELinkAttributesMap = {
  rt: 'resourceType',
  if: 'interfaceDescription',
  sz: 'maximumSizeEstimate'
}

const COAP_MULTICAST_IP = '224.0.1.187'
const COAP_DISCOVERY_URI = '.well-known/core'

const COAP_CODE_CONTENT = '2.05'

const COAP_URI_REGEX = /<\/([a-zA-Z0-9/]+)>/i
const COAP_ATTR_REGEX = /(rt|if|sz)="(.+)"/i


class esp32CoAP extends EventEmitter{
  constructor(){
    super()

    this.observedResources = []
    this.observationInterval = null
  }

  observeResource (resource) {
    resource.unit = this.parseUnitFromType(resource.attributes.resourceType)
    this.observedResources.push(resource)
  }

  parseResource(resourceString){
    var resource = {}

    resourceString.split(';')
      .forEach(value => {
        var urlMatches = value.match(COAP_URI_REGEX)
        if (urlMatches) {
          resource.uri = urlMatches[1]
        } else {
          var attributeMatches = value.match(COAP_ATTR_REGEX)
          if (attributeMatches) {
            if (!resource.attributes) {
              resource.attributes = {}
            }
            var type = CoRELinkAttributesMap[attributeMatches[1]]
            var content = attributeMatches[2]

            resource.attributes[type] = content
          }
        }
      })
    return resource
  }

  request(url, cb){
    coap.request(url).on('response', cb).end()
  }

  parsePayloadValue (payload, expectedUnit) {
    var payloadString
    if (typeof payload === 'string' || payload instanceof String) {
      payloadString = payload
    } else {
      payloadString = payload.toString()
    }

    if (payloadString.endsWith(expectedUnit)) {
      var value = +payloadString.slice(0, -1 * expectedUnit.length);
      if(value != NaN){
        return value;
      }
    } else {
      payloadString = payloadString.replace(/\s/g, '')
      if (payloadString.endsWith(expectedUnit)) {
        var value = +payloadString.slice(0, -1 * expectedUnit.length);
        if(value != NaN){
          return value;
        }
      }
    }
    return false
  }

  parseUnitFromType (type) {
    switch (type) {
      case 'temperature-f':
        return 'F'
      case 'temperature-c':
        return 'C'
      case 'humidity-p':
        return '%'
      default:
        return ''
    }
  }

  observationLoop(){
    this.observedResources.forEach(resource => {
      this.request(`coap://${COAP_MULTICAST_IP}/${resource.uri}`, response => {
        var value = this.parsePayloadValue(response.payload, resource.unit)
        if(value){
          this.emit('measurement', {
            value : value,
            unit : resource.unit,
            name : resource.uri,
            timestamp: new Date().toISOString(),
            type : resource.attributes.resourceType
          })
        }
      })
   })
  }


  discoverResources(){
    this.request(`coap://${COAP_MULTICAST_IP}/${COAP_DISCOVERY_URI}`, response => {
      if (response.code === COAP_CODE_CONTENT) {
        response.payload.toString()
          .split('\n')
          .filter(resourceString => resourceString.trim().length > 0)
          .map(resourceString => this.parseResource(resourceString))
          .forEach(resource => this.observeResource(resource))
      }
    })
  }

  startObservation(interval){
    if(!this.observationInterval){
      this.observationInterval = setInterval(() => this.observationLoop(), interval)
    }
  }

  stopObservation(){
    clearInterval(this.observationInterval)
  }
}


module.exports = esp32CoAP