var mqtt = require('mqtt')
var coap = require('coap')

const COAP_MULTICAST_IP = '224.0.1.187'
const COAP_DISCOVERY_URI = '.well-known/core'

const COAP_CODE_CONTENT = '2.05'

var CoRELinkAttributesMap = {
  rt: 'resourceType',
  if: 'interfaceDescription',
  sz: 'maximumSizeEstimate'
}

if (!process.env.GW_MQTT_SERVER || !process.env.GW_MQTT_USER || !process.env.GW_MQTT_PASSWORD) {
  console.error('Missing MQTT config, please make sure to set $MQTT_SERVER, $MQTT_USER and $MQTT_PASSWORD')
  process.exit(1)
} else {
  var MQTT_SERVER = process.env.GW_MQTT_SERVER
  var MQTT_USER = process.env.GW_MQTT_USER
  var MQTT_PASSWORD = process.env.GW_MQTT_PASSWORD
}

var SCRAPE_INTERVAL_MS = process.env.GW_SCRAPE_INTERVAL || 2500
var PUBLISH_CUMULOCITY = !!process.env.GW_PUBLISH_CUMULOCITY

var PREFIX = process.env.GW_MQTT_PREFIX || 'testprefix'
var TENANT = process.env.GW_TENANT || 'testtenant'

var ID = 'unknown_id_'


if (process.env.GW_DEVICE_ID) {
  ID = process.env.GW_DEVICE_ID
} else {
  try {
    ID = require('child_process')
      .execSync("cat /proc/cpuinfo | grep -oP 'Serial\\s*: \\K([a-zA-Z0-9]+)'")
      .toString().slice(0, -1)
  } catch (e) {
    console.error('Error receiving CPU serial:', e.message)
  }
}

var observedCOAPResources = []


function isAlertValue (value, type) {
  switch (type) {
    case 'temperature-f':
      return process.env.GW_ALERT_TRESHOLD_TEMPERATURE_F && value > +process.env.GW_ALERT_TRESHOLD_TEMPERATURE_F
    case 'temperature-c':
      return process.env.GW_ALERT_TRESHOLD_TEMPERATURE_C && value > +process.env.GW_ALERT_TRESHOLD_TEMPERATURE_C
    case 'humidity-p':
      return process.env.GW_ALERT_TRESHOLD_HUMIDITY_P && value > +process.env.GW_ALERT_TRESHOLD_HUMIDITY_P
  }
  return false
}

function parseUnitFromType (type) {
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

function parsePayloadValue (payload, expectedUnit) {
  var payloadString
  if (typeof payload === 'string' || payload instanceof String) {
    payloadString = payload
  } else {
    payloadString = payload.toString()
  }

  if (payloadString.endsWith(expectedUnit)) {
    return payloadString.slice(0, -1 * expectedUnit.length)
  } else {
    payloadString = payloadString.replace(/\s/g, '')
    if (payloadString.endsWith(expectedUnit)) {
      return payloadString.slice(0, -1 * expectedUnit.length)
    }
  }
  return false
}

function observeCOAPResource (resource) {
  resource.unit = parseUnitFromType(resource.attributes.resourceType)
  observedCOAPResources.push(resource)
}

function parseCOAPResource(resourceString){
  var resource = {
    deviceAddress: response.rsinfo.address
  }

  resourceString.split(';')
    .forEach(value => {
      var urlMatches = value.match(/<\/([a-zA-Z0-9/]+)>/i)
      if (urlMatches) {
        resource.uri = urlMatches[1]
      } else {
        var attributeMatches = value.match(/(rt|if|sz)="(.+)"/i)
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


function onCOAPDiscovery(response){
  if (response.code === COAP_CODE_CONTENT) {
    response.payload.toString()
      .split('\n')
      .filter(resourceString => resourceString.trim().length > 0)
      .map(parseCOAPResource)
      .forEach(observedCOAPResources)
  }
}

function updateCOAPResource(resource){
  doCOAPRequest(`coap://${COAP_MULTICAST_IP}/${resource.uri}`, response => {

    var measurement = parsePayloadValue(response.payload, resource.unit)
    publishMeasurement(resource.uri, value, resource.unit)

    if (PUBLISH_CUMULOCITY && isAlertValue(value, resource.attributes.resourceType)) {
      publishAlert(301, value, resource.unit, resource.attributes.resourceType)
    }
  })
  
}

function doCOAPRequest(url, cb){
  coap.request(url).on('response', cb).end()
}

function publishMeasurement (name, value, unit) {
  if (!client.connected) {
    return
  }

  if (PUBLISH_CUMULOCITY) {
    mqttClient.publish('s/us', `200,${name},${name},${value},${unit},${new Date().toISOString()}`)
  } else {
    var data = {
      value: value,
      unit: unit,
      timestamp: new Date().toIsoString()
    }
    mqttClient.publish(`${PREFIX}/${TENANT}/${ID}/${name}`, JSON.stringify(data))
  }
}

function publishAlert (level, value, unit, type) {
  mqttClient.publish('s/us', `${level},exceeding_treshold,measurement ${type} (${value}${unit}) exceeding treshold`)
}



doCOAPRequest(`coap://${COAP_MULTICAST_IP}/${COAP_DISCOVERY_URI}`, onCOAPDiscovery)

var mqttClient = mqtt.connect(MQTT_SERVER, {
  clientId: ID,
  username: MQTT_USER,
  password: MQTT_PASSWORD
})

client.on('connect', function () {
  if (PUBLISH_CUMULOCITY) {
    mqttClient.publish('s/us', `100,${ID},c8y_MQTTdevice`)
    mqttClient.publish('s/us', '110,S123456789,MQTT test model,Rev0.1')
  }
  console.log('MQTT connected')
})

setInterval(() => resourcesToWatch.forEach(updateCOAPResource), SCRAPE_INTERVAL_MS)
