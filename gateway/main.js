var mqtt = require('mqtt');
var coap = require('coap');


const COAP_MULTICAST_IP = "224.0.1.187";
const COAP_DISCOVERY_URI = ".well-known/core";

const COAP_CODE_CONTENT = "2.05";

var CoRE_Link_Attributes_Map = {
    rt : "resourceType",
    if : "interfaceDescription",
    sz : "maximumSizeEstimate"
};


console.log(process.env)
if(!process.env.GW_MQTT_SERVER || !process.env.GW_MQTT_USER || !process.env.GW_MQTT_PASSWORD){
    console.error("Missing MQTT config, please make sure to set $MQTT_SERVER, $MQTT_USER and $MQTT_PASSWORD");
    process.exit(1);
} else {
    var MQTT_SERVER = process.env.GW_MQTT_SERVER;
    var MQTT_USER = process.env.GW_MQTT_USER;
    var MQTT_PASSWORD = process.env.GW_MQTT_PASSWORD;
}

var SCRAPE_INTERVAL_MS = process.env.GW_SCRAPE_INTERVAL || 2500;
var PUBLISH_CUMULOCITY = !!process.env.GW_PUBLISH_CUMULOCITY;

var PREFIX = process.env.GW_MQTT_PREFIX || "testprefix";
var TENANT = process.env.GW_TENANT || "testtenant";

var ID = "unknown_id_";

if(process.env.GW_DEVICE_ID){
    ID = process.env.GW_DEVICE_ID
}
else {
    try {
        ID = require( 'child_process' )
            .execSync("cat /proc/cpuinfo | grep -oP 'Serial\\s*: \\K([a-zA-Z0-9]+)'")
            .toString().slice(0,-1)
    }
    catch(e){
        console.error("Error receiving CPU serial:", e.message);
    }
}

var resourcesToWatch = [];


function isAlertValue(value, type){
    switch(type){
        case "temperature-f":
            return process.env.GW_ALERT_TRESHOLD_TEMPERATURE_F && value > +process.env.GW_ALERT_TRESHOLD_TEMPERATURE_F;
        case "temperature-c":
            return process.env.GW_ALERT_TRESHOLD_TEMPERATURE_C && value > +process.env.GW_ALERT_TRESHOLD_TEMPERATURE_C;
        case "humidity-p":
            return process.env.GW_ALERT_TRESHOLD_HUMIDITY_P && value > +process.env.GW_ALERT_TRESHOLD_HUMIDITY_P;
    }
    return false;
}

function resolveUnitFromType(type){
    switch(type){
        case "temperature-f":
            return "F"
        case "temperature-c":
            return "C";
        case "humidity-p":
            return "%";
        default:
            return "";
    }
}

function parsePayloadValue(payload, expectedUnit){

    var payloadString;
    if (typeof payload === 'string' || payload instanceof String){
        payloadString = payload;
    }
    else {
        payloadString = payload.toString();
    }

    if(payloadString.endsWith(expectedUnit)){
        return payloadString.slice(0, -1 * expectedUnit.length);
    }
    else {
        payloadString = payloadString.replace(/\s/g,'');
        if(payloadString.endsWith(expectedUnit)){
            return payloadString.slice(0, -1 * expectedUnit.length);
        }
    }
    return false;
}

function addResourceToWatch(resource){
    resource.unit = resolveUnitFromType(resource.attributes.resourceType);

    console.log("New resource!", resource);

    resourcesToWatch.push(resource);
}


coap.request(`coap://${COAP_MULTICAST_IP}/${COAP_DISCOVERY_URI}`)
.on('response', response => {
    if(response.code == COAP_CODE_CONTENT){

        var resources = response.payload.toString()
        .split('\n')
        .filter(resourceString => resourceString.trim().length > 0)
        .map(resourceString => {
            var resource = {
                deviceAddress: response.rsinfo.address,
            };

            resourceString.split(';')
            .forEach(value => {

                var urlMatches = value.match(/<\/([a-zA-Z0-9\/]+)>/i);
                if(urlMatches){
                    resource.uri = urlMatches[1];
                }
                else {
                    var attributeMatches = value.match(/(rt|if|sz)="(.+)"/i);
                    if(attributeMatches){

                        if(!resource.attributes){
                            resource.attributes = {};
                        }
                        var type = CoRE_Link_Attributes_Map[attributeMatches[1]];
                        var value = attributeMatches[2];

                        resource.attributes[type] = value;
                    }
                }
            });

            return resource;
        })
        .forEach(addResourceToWatch);
    }
})
.end();



var client = mqtt.connect(MQTT_SERVER, {
    clientId : ID,
    username : MQTT_USER,
    password : MQTT_PASSWORD
});

client.on('connect', function () {
    if(PUBLISH_CUMULOCITY){
        client.publish("s/us", `100,${ID},c8y_MQTTdevice`);
        client.publish("s/us", "110,S123456789,MQTT test model,Rev0.1");
    }
    console.log("MQTT connected");
});

function publishMeasurement(name, value, unit){
    if(!client.connected){
        return;
    }

    if(PUBLISH_CUMULOCITY){
        client.publish("s/us", `200,${name},${name},${value},${unit},${new Date().toISOString()}`);
    } else {
        var data = {
            value : value,
            unit : unit,
            timestamp: new Date().toIsoString()
        };
        client.publish(`${PREFIX}/${TENANT}/${ID}/${name}`, JSON.stringify(data));
    }
}

function publishAlert(level, value, unit, type){
    client.publish("s/us", `${level},exceeding_treshold,measurement ${type} (${value}${unit}) exceeding treshold`);
}

var scrapeIntervalID = setInterval(() => {
    resourcesToWatch.forEach(resource => {
        coap.request(`coap://${COAP_MULTICAST_IP}/${resource.uri}`)
        .on('response', response => {
            console.log("response: ", response.payload.toString());

            var value = parsePayloadValue(response.payload, resource.unit);
            publishMeasurement(resource.uri, value, resource.unit);    

            if(PUBLISH_CUMULOCITY && isAlertValue(value, resource.attributes.resourceType)){
                publishAlert(301, value, resource.unit, resource.attributes.resourceType);
            }
        })
        .end();
    });
}, SCRAPE_INTERVAL_MS)


