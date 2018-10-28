# Arduino sketch for esp32

* reads out DHT-22 measurements
* publishes temperature & humidity via CoAP
* broadcast discovery possible on the CoAP multicast IP `224.0.1.187`

## Board

Add `https://dl.espressif.com/dl/package_esp32_index.json` to the board manager URLs

Select board `ESP32 dev module`

## Libraries

Add libraries:

* Ticker
* WiFi (only includes `WiFi.h` and `WiFiUpd.h` necessary)
* [DHTesp](https://github.com/beegee-tokyo/DHTesp)
* [CoAP simple library](https://github.com/hirotakaster/CoAP-simple-library)

## Serial

9600 Baud