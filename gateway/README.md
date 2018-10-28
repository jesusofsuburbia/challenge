# Challenge

This is an IoT gateway that discovers CoAP sensors offering temperature and humidity.

The data gets scraped in intervals and is published to an MQTT broker.

## Run

First, install all dependencies

```
npm install
```

Then, you can start the application.
Make sure to export your configuration as environment variables first (see below)

```
node main.js
```

## Check MQTT messages

* Install and run mosca 

```
npm install mosca
node test/test-mosca.js
```

* Switch terminal and run

```
GW_MQTT_SERVER="mqtt://localhost" node main.js
```

* The log output of mosca should show messages like this

```
testprefix/testtenant/unknown_id_/temperature	 {"value":22.1,"unit":"C","timestamp":"2018-10-28T16:16:52.363Z"}
```

### Configuration 

To set a variable, run (for example):

```
env GW_MQTT_SERVER="mqtts://yourname.cumulocity.com"
```

| Environment Variable | Description |
| --- | --- |
| GW_MQTT_SERVER | Url to your MQTT server, e.g. `mqtts://yourname.cumulocity.com` |
| GW_MQTT_USER | MQTT username |
| GW_MQTT_PASSWORD | MQTT password |
| GW_PUBLISH_CUMULOCITY | Whether to format and publish data tailored for cumulocity |
| GW_ALERT_TRESHOLD_HUMIDITY_P | Treshold for humidity. Triggers alert when exceeded |
| GW_ALERT_TRESHOLD_TEMPERATURE_C | Treshold for temperature when measured in Centigrade. Triggers alert when exceeded |
| GW_ALERT_TRESHOLD_TEMPERATURE_F | Treshold for temperature when measured in Fahrenheit. Triggers alert when exceeded |
