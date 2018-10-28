var mqtt = require('mqtt')
var esp32CoAP = require('./modules/esp32CoAP.js')


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

var mqttClient = mqtt.connect(MQTT_SERVER, {
  clientId: ID,
  username: MQTT_USER,
  password: MQTT_PASSWORD
})

mqttClient.on('connect', function () {
  if (PUBLISH_CUMULOCITY) {
    mqttClient.publish('s/us', `100,${ID},c8y_MQTTdevice`)
    mqttClient.publish('s/us', '110,S123456789,MQTT test model,Rev0.1')
  }
  console.log('MQTT connected')
})

var coap = new esp32CoAP();
coap.on('measurement', measurement => {
  if (!mqttClient.connected) {
    return
  }

  if (PUBLISH_CUMULOCITY) {
    mqttClient.publish('s/us', `200,${measurement.name},${measurement.name},${measurement.value},${measurement.unit},${measurement.timestamp}`)
    if(isAlertValue(measurement.value, measurement.type)){
      mqttClient.publish('s/us', `301,exceeding_treshold,measurement ${measurement.type} (${measurement.value}${measurement.unit}) exceeding treshold`)
    }
  } else {
    var data = {
      value: measurement.value,
      unit: measurement.unit,
      timestamp: measurement.timestamp
    }
    mqttClient.publish(`${PREFIX}/${TENANT}/${ID}/${name}`, JSON.stringify(data))
  }
});

coap.discoverResources()
coap.startObservation(SCRAPE_INTERVAL_MS)