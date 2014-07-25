# adc-ads1x15

JavaScript module for the ADS1015/ADS1115 analog-to-digital converter chip

Based on [a Python implementation](https://github.com/adafruit/Adafruit-Raspberry-Pi-Python-Code/tree/master/Adafruit_ADS1x15)

*Work in progress*

## Hardware

This library is for using Texas Instruments [ADS1015](http://www.ti.com/product/ads1015) or [ADS1115](http://www.ti.com/product/ads1115)
analog-to-digital converters with [Tessel](https://tessel.io/).

To acquire a Tessel compatible module you can:

- Buy a board from Adafruit: [ADS1115](http://www.adafruit.com/products/1085), [ADS1015](http://www.adafruit.com/products/1083).
- Buy IC from TI, buy MSOP10 adapter board from Ebay and solder yourself (add few pull-up resistors and a capacitor).

## Features

- Read a single value
- Read a single differential value

## Todo

- Some bit operations can probably be replaced with Buffer operations
- Continuous conversion mode
- Documentation
- Tests
- Schematics/notes for building the module

## Not implemented

- Conversion ready pin (not implemented on Python version)
