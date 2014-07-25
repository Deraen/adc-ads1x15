// Datasheet: http://www.ti.com/lit/ds/symlink/ads1115.pdf

var defaults = require('lodash.defaults');

var
  // Pointer Register
  ADS1015_REG_POINTER_MASK        = 0x03,
  ADS1015_REG_POINTER_CONVERT     = 0x00,
  ADS1015_REG_POINTER_CONFIG      = 0x01,
  ADS1015_REG_POINTER_LOWTHRESH   = 0x02,
  ADS1015_REG_POINTER_HITHRESH    = 0x03,

  // Config Register
  ADS1015_REG_CONFIG_OS_MASK      = 0x8000,
  ADS1015_REG_CONFIG_OS_SINGLE    = 0x8000,  // Write: Set to start a single-conversion
  ADS1015_REG_CONFIG_OS_BUSY      = 0x0000,  // Read: Bit = 0 when conversion is in progress
  ADS1015_REG_CONFIG_OS_NOTBUSY   = 0x8000,  // Read: Bit = 1 when device is not performing a conversion

  ADS1015_REG_CONFIG_MUX_MASK     = 0x7000,

  ADS1015_REG_CONFIG_PGA_MASK     = 0x0E00,

  ADS1015_REG_CONFIG_MODE_MASK    = 0x0100,
  ADS1015_REG_CONFIG_MODE_CONTIN  = 0x0000,  // Continuous conversion mode
  ADS1015_REG_CONFIG_MODE_SINGLE  = 0x0100,  // Power-down single-shot mode (default)

  ADS1015_REG_CONFIG_DR_MASK      = 0x00E0,

  ADS1015_REG_CONFIG_CMODE_MASK   = 0x0010,
  ADS1015_REG_CONFIG_CMODE_TRAD   = 0x0000,  // Traditional comparator with hysteresis (default)
  ADS1015_REG_CONFIG_CMODE_WINDOW = 0x0010,  // Window comparator

  ADS1015_REG_CONFIG_CPOL_MASK    = 0x0008,
  ADS1015_REG_CONFIG_CPOL_ACTVLOW = 0x0000,  // ALERT/RDY pin is low when active (default)
  ADS1015_REG_CONFIG_CPOL_ACTVHI  = 0x0008,  // ALERT/RDY pin is high when active

  ADS1015_REG_CONFIG_CLAT_MASK    = 0x0004,  // Determines if ALERT/RDY pin latches once asserted
  ADS1015_REG_CONFIG_CLAT_NONLAT  = 0x0000,  // Non-latching comparator (default)
  ADS1015_REG_CONFIG_CLAT_LATCH   = 0x0004,  // Latching comparator

  ADS1015_REG_CONFIG_CQUE_MASK    = 0x0003,
  ADS1015_REG_CONFIG_CQUE_1CONV   = 0x0000,  // Assert ALERT/RDY after one conversions
  ADS1015_REG_CONFIG_CQUE_2CONV   = 0x0001,  // Assert ALERT/RDY after two conversions
  ADS1015_REG_CONFIG_CQUE_4CONV   = 0x0002,  // Assert ALERT/RDY after four conversions
  ADS1015_REG_CONFIG_CQUE_NONE    = 0x0003;  // Disable the comparator and put ALERT/RDY in high state (default)

var defaultConfig = ADS1015_REG_CONFIG_CQUE_NONE // Disable comparator
  | ADS1015_REG_CONFIG_CLAT_NONLAT // Non-latching
  | ADS1015_REG_CONFIG_CPOL_ACTVLOW // Alert/Rdy active low
  | ADS1015_REG_CONFIG_CMODE_TRAD // traditional comparator
  | ADS1015_REG_CONFIG_MODE_SINGLE; // single-shot mode

// Settings per ic
// sps: samples per second
var ics = {
  'ads1115': {
    sps: {
      8: 0x0000,  // 8 samples per second
      16: 0x0020,  // 16 samples per second
      32: 0x0040,  // 32 samples per second
      64: 0x0060,  // 64 samples per second
      128: 0x0080,  // 128 samples per second
      250: 0x00A0,  // 250 samples per second
      475: 0x00C0,  // 475 samples per second
      860: 0x00E0,  // 860 samples per second
    },
    defaultSps: 250,
    getValue: function(buffer, pga) {
      return buffer.readInt16BE(0) * pga / 32768.0;
    },
  },
  'ads1015':  {
    sps: {
      128: 0x0000,  // 128 samples per second
      250: 0x0020,  // 250 samples per second
      490: 0x0040,  // 490 samples per second
      920: 0x0060,  // 920 samples per second
      1600: 0x0080,  // 1600 samples per second
      2400: 0x00A0,  // 2400 samples per second
      3300: 0x00C0,  // 3300 samples per second (also 0x00E0)
    },
    defaultSps: 250,
    getValue: function(buffer, pga) {
      // Shift right 4 bits for the 12-bit ADS1015 and convert to mV
      return ( ((result[0] << 8) | (result[1] & 0xFF)) >> 4 ) * pga / 2048.0;
    },
  },
};

// programable gains
var pgaADS1x15 = {
  6144: 0x0000,  // +/-6.144V range
  4096: 0x0200,  // +/-4.096V range
  2048: 0x0400,  // +/-2.048V range
  1024: 0x0600,  // +/-1.024V range
  512: 0x0800,  // +/-0.512V range
  256: 0x0A00,  // +/-0.256V range
};
var pgaDefault = 6144;

// channels
var channels = {
  0: 0x4000,  // Single-ended AIN0
  1: 0x5000,  // Single-ended AIN1
  2: 0x6000,  // Single-ended AIN2
  3: 0x7000,  // Single-ended AIN3
};

var diffs = {
  0: {
    1: 0x0000,  // Differential P = AIN0, N = AIN1
    3: 0x1000,  // Differential P = AIN0, N = AIN3
  },
  1: {
    3: 0x2000,  // Differential P = AIN1, N = AIN3
  },
  2: {
    3: 0x3000,  // Differential P = AIN2, N = AIN3
  }
};

function Ads1x15(hardware, opts) {
  var self = this;

  defaults(opts, {
    address: 0x48,
    ic: 'ads1015',
  });

  if (!ics.hasOwnProperty(opts.ic)) {
    throw {message: "Ads1x15: Invalid IC specified: " + opts.ic};
  }

  self.ic = ics[opts.ic];
  self.hardware = hardware;
  self.i2c = self.hardware.I2C(opts.address);
  // Set pga value, so that getLastConversionResult() can use it,
  // any function that accepts a pga value must update this.
  self.pga = pgaDefault;
}

Ads1x15.prototype._configSps = function(config, sps) {
  var self = this;
  // Set sample per seconds
  if (!self.ic.sps.hasOwnProperty(sps)) {
    throw {message: "ADS1x15: Invalid sps specified: " + sps};
  }
  config |= self.ic.sps[sps];
  return config;
};

Ads1x15.prototype._configPga = function(config, pga) {
  var self = this;
  // Set PGA/voltage range
  if (!pgaADS1x15.hasOwnProperty(pga)) {
    throw {message: "ADS1x15: Invalid pga specified: " + pga};
  }
  config |= pgaADS1x15[pga];

  self.pga = pga;

  return config;
};

Ads1x15.prototype._useConfig = function(config, sps, cb) {
  var self = this;
  // Write config register to the ADC
  self.i2c.send(new Buffer([ADS1015_REG_POINTER_CONFIG, (config >> 8) & 0xFF, config & 0xFF]), function(err) {
    if (err) return cb(err);
    // Wait for the ADC conversion to complete
    // The minimum delay depends on the sps: delay >= 1/sps
    // We add 0.1ms to be sure
    var delay = 1.0 / sps + 0.0001;
    setTimeout(cb, delay);
  });
};

Ads1x15.prototype._readResult = function(pga, cb) {
  var self = this;
  // Read the conversion results
  // Write address and read to 2 bytes
  self.i2c.transfer(new Buffer([ADS1015_REG_POINTER_CONVERT]), 2, function(err, result) {
    cb(null, self.ic.getValue(result, pga));
  });
};

/*
   Gets a single-ended ADC reading from the specified channel in mV.
   The sample rate for this mode (single-shot) can be used to lower the noise
   (low sps) or to lower the power consumption (high sps) by duty cycling,
   see datasheet page 14 for more info.
   The pga must be given in mV, see page 13 for the supported values.
   */
Ads1x15.prototype.readADCSingleEnded = function(opts , cb) {
  var self = this;

  defaults(opts, {
    channel: 0,
    pga: pgaDefault,
    sps: self.ic.spsDefault,
  });

  var config = defaultConfig;

  try {
    config = self._configSps(config, opts.sps);
    config = self._configPga(config, opts.pga);
  } catch (err) {
    return cb(err);
  };

  // Set the channel to be converted

  if (!channels[opts.channel]) {
    return cb({message: "ADS1x15: Invalid channel specified: " + opts.channel});
  }
  config |= channels[opts.channel];

  // Set 'start single-conversion' bit
  config |= ADS1015_REG_CONFIG_OS_SINGLE

  self._useConfig(config, opts.sps, function() {
    self._readResult(opts.pga, cb);
  });
};

/*
   Gets a differential ADC reading from channels chP and chN in mV.
   The sample rate for this mode (single-shot) can be used to lower the noise
   (low sps) or to lower the power consumption (high sps) by duty cycling,
   see data sheet page 14 for more info.
   The pga must be given in mV, see page 13 for the supported values.
   */
Ads1x15.prototype.readADCDifferential = function(opts, cb) {
  var self = this;

  defaults(opts, {
    chP: 0,
    chN: 1,
    pga: pgaDefault,
    sps: self.ic.defaultSps,
  });

  var config = defaultConfig;

  // Set channels
  if (!diffs.hasOwnProperty(opts.chP) || !diffs[opts.chP].hasOwnProperty(opts.chN)) {
    return cb({message: "ADS1x15: Invalid channels specified: " + opts.chP + ", " + opts.chN});
  };
  config |= diffs[opts.chP][opts.chN];

  try {
    config = self._configSps(config, opts.sps);
    config = self._configPga(config, opts.pga);
  } catch (err) {
    return cb(err);
  };

  // Set 'start single-conversion' bit
  config |= ADS1015_REG_CONFIG_OS_SINGLE;

  self._useConfig(config, opts.sps, function() {
    self._readResult(opts.pga, cb);
  });
};

module.exports = Ads1x15;
