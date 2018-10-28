#include <DHTesp.h>
#include <Ticker.h>

#include <WiFi.h>
#include <WiFiUdp.h>
#include <coap.h>

#ifndef ESP32
#define ESP32
#endif

const char* ssid     = "*****";
const char* password = "*****";

DHTesp dht;

void temperatureLoop(void *pvParameters);
void updateTemperature();

TaskHandle_t temperatureTask = NULL;
Ticker ticker;
bool tasksEnabled = false;
int dhtPin = 14;
float temperature = 0.f;
float humidity = 0.f;


void callback_well_known(CoapPacket &packet, IPAddress ip, int port);
void callback_temperature(CoapPacket &packet, IPAddress ip, int port);
void callback_humidity(CoapPacket &packet, IPAddress ip, int port);


WiFiUDP udp;
WiFiUDP multicast;

Coap coap(udp);


typedef struct {
  String url;
  String resourceType;
  String interfaceDescription;
  String maximumSizeEstimate;
} CoapResource;

CoapResource coapResources[MAX_CALLBACK];


void callback_well_known(CoapPacket &packet, IPAddress ip, int port) {
  if(packet.code == COAP_GET){
    Serial.println("[Discovery]");

    char buf[MAX_CALLBACK * 150];

    String resources = "";

    int offset = 0;
    for(int i = 0; i < MAX_CALLBACK && coapResources[i].url != NULL; i++){
      if(coapResources[i].url == NULL){
        continue;
      }
      sprintf(buf + offset, "%</%s>;rt=\"%s\";if=\"%s\";sz=\"%s\"\n", coapResources[i].url.c_str(), coapResources[i].resourceType.c_str(), coapResources[i].interfaceDescription.c_str(), coapResources[i].maximumSizeEstimate.c_str());
      offset = strlen(buf);
    }
    
    coap.sendResponse(ip, port, packet.messageid, buf, strlen(buf), COAP_CONTENT, COAP_TEXT_PLAIN, packet.token, packet.tokenlen);
    buf[0] = '\0';
  }
}

void callback_temperature(CoapPacket &packet, IPAddress ip, int port) {
  if(packet.code == COAP_GET){
    Serial.printf("[GET TEMPERATURE] %'.2fC\n", temperature);

    char responseBuf[10];
    sprintf(responseBuf, "%'.2fC", temperature);
    coap.sendResponse(ip, port, packet.messageid, responseBuf, strlen(responseBuf), COAP_CONTENT, COAP_TEXT_PLAIN, packet.token, packet.tokenlen);
  }
}

void callback_humidity(CoapPacket &packet, IPAddress ip, int port) {
  if(packet.code == COAP_GET){
    Serial.printf("[GET HUMIDITY] %'.2f%%\n", humidity);

    char responseBuf[10];
    sprintf(responseBuf, "%'.2f%%", humidity);
    coap.sendResponse(ip, port, packet.messageid, responseBuf, strlen(responseBuf), COAP_CONTENT, COAP_TEXT_PLAIN, packet.token, packet.tokenlen);
  }
}


void registerResource(callback cb, String url, String resourceType, String interfaceDescription, String maximumSizeEstimate){
  Serial.printf("Register resource </%s>;rt=\"%s\";if=\"%s\";sz=\"%s\" ", url.c_str(), resourceType.c_str(), interfaceDescription.c_str(), maximumSizeEstimate.c_str());
  
  int i = 0;
  for (; i < MAX_CALLBACK; i++){
    if(coapResources[i].url.equals(url) || coapResources[i].url == NULL){
      break;
    }
  }
  Serial.printf("(Interface index: %d)\n", i);
  coapResources[i].url = url;
  coapResources[i].resourceType = resourceType;
  coapResources[i].interfaceDescription = interfaceDescription;
  coapResources[i].maximumSizeEstimate = maximumSizeEstimate;
  coap.server(cb, url);
}


bool initTemperatureTask() {
  TaskFunction_t taskFunction = temperatureLoop;
  const char* taskName = "temperatureLoop";
  const uint16_t taskStackSize = 4000;
  void * taskFunctionParameters = NULL;
  UBaseType_t taskPriority = 5;
  BaseType_t taskCore = 1;

  Serial.print("Creating task... ");
  
  xTaskCreatePinnedToCore(taskFunction, taskName, taskStackSize, taskFunctionParameters, taskPriority, &temperatureTask, taskCore);

  if (temperatureTask == NULL) {
    Serial.println("failed!");
    return false;
  } else {
    Serial.println("success!");
    ticker.attach(20, updateTemperature);
  }
  return true;
}

void updateTemperature() {
  if (temperatureTask != NULL) {
     xTaskResumeFromISR(temperatureTask);
  }
}

void temperatureLoop(void *pvParameters) {
  while (1) {
    if (tasksEnabled) {
      TempAndHumidity data = dht.getTempAndHumidity();
      if (dht.getStatus() != 0) {
        Serial.println("Error: " + String(dht.getStatusString()));
      } else {
        temperature = data.temperature;
        humidity = data.humidity;  
      }
    }
    vTaskSuspend(NULL);
  }
}

String getMaximumPayloadSize(int maxValue, int minValue, int decimals, String unit){
  int maximumStringChars = std::max(String(maxValue).length(), String(minValue).length()) +
                           1 + decimals + unit.length();

  return String(maximumStringChars + 1);
}


void setup() {
  Serial.begin(9600);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
      delay(500);
      Serial.print(".");
  }
  WiFi.setHostname("node1-esp32");

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  dht.setup(dhtPin, DHTesp::DHT22);

  if(initTemperatureTask()){
    tasksEnabled = true;
  } else {
    Serial.println("Error initializing temperature task");
  }
  
  Serial.println("Setup Discovery");
  coap.server(callback_well_known, ".well-known/core");

  registerResource(callback_temperature, "temperature", "temperature-c", "sensor", getMaximumPayloadSize(dht.getUpperBoundTemperature(), dht.getLowerBoundTemperature(), 2, "C"));
  registerResource(callback_humidity, "humidity", "humidity-p", "sensor", getMaximumPayloadSize(dht.getUpperBoundHumidity(), dht.getLowerBoundHumidity(), 2, "%"));

  // start coap server/client
  coap.start();

  IPAddress coapDiscoveryIP(224, 0, 1, 187);
  multicast.beginMulticast(coapDiscoveryIP, 5683);
}

void loop() {
  delay(1000);
  if (temperatureTask != NULL) {
    vTaskResume(temperatureTask);
  }
  coap.loop();
}
