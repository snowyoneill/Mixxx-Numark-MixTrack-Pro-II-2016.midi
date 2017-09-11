// Based on Numark Mixtrack Mapping Script Functions
// 1/11/2010 - v0.1 - Matteo <matteo@magm3.com>
//
// 5/18/2011 - Changed by James Ralston
// 05/26/2012 to 06/27/2012 - Changed by Darío José Freije <dario2004@gmail.com>
//
// Prepared by Thomas Preston for MixTrack Pro II
// Completed by Armen Rizal to work as close as in the manual.
//
//
// Bug Fixes: 
// - When top row of pads flash, it's not maintaining original state of the leds.
// - KeyLock is not turning back to original state after scratching. Solution: always turn KeyLock ON by default.
//
// Known Issue: 
// - Cue Point Led address is missing
// - ToggleSelectedSidebarItem control is not working
// - After activating brake, Play button is not working

// 10/26/2016 - Changed by Shaun O'Neill
//              Updated the flanger effects rack. Removed depricated XML controls and added new JS functions to modify the FX knobs
// 10/10/2017 - Changed by Shaun O'Neill
//              Added super button control via shift + fx1 knob.
//              Low frequency filter now doubles as filter effect control via shift key.


function NumarkMixTrackProII() {}

NumarkMixTrackProII.init = function(id) {   // called when the MIDI device is opened & set up
    NumarkMixTrackProII.id = id;    // Store the ID of this device for later use

    // [deck 1, deck 2]
    NumarkMixTrackProII.directoryMode = false;
    NumarkMixTrackProII.scratch_mode = [true, true];
    NumarkMixTrackProII.isKeyLocked = [1, 1];
    NumarkMixTrackProII.touch = [false, false];
    NumarkMixTrackProII.scratchTimer = [-1, -1];

    NumarkMixTrackProII.shift_is_pressed = [false, false];
    NumarkMixTrackProII.pad_modes = {
        LOOP: 'loop',
        SAMPLE: 'sample',
        CUE: 'cue',
    }
    NumarkMixTrackProII.pad_mode = NumarkMixTrackProII.pad_modes.LOOP;
    NumarkMixTrackProII.cue_delete_mode = [false, false];
    NumarkMixTrackProII.pitch_slider_ranges = [0.08, 0.16, 0.50];
    NumarkMixTrackProII.pitch_slider_range_index = 0;

    // LED addresses 
    NumarkMixTrackProII.leds = [
        // Common
        {"directory": 0x34,
         "file": 0x4B},
        // Deck 1
        {"rate": 0x28,
         "scratch_mode": 0x48,
         "loop_in": 0x53,
         "loop_out": 0x54,
         "reloop": 0x55,
         "loop_halve": 0x63,
         "sample_1": 0x65,
         "sample_2": 0x66,
         "sample_3": 0x67,
         "sample_4": 0x68,
         "hotcue_1" : 0x6D,
         "hotcue_2" : 0x6E,
         "hotcue_3" : 0x6F,
         "hotcue_delete" : 0x70,
         "fx1": 0x59,
         "fx2": 0x5A,
         "fx3": 0x5B,
         "tap": 0x5C,
         "sync" : 0x40,
         "cue" : 0x33,
         "play_pause": 0x3B,
         "stutter" : 0x4A},
        // Deck 2
        {"rate": 0x29,
         "scratch_mode": 0x50,
         "loop_in": 0x56,
         "loop_out": 0x57,
         "reloop": 0x58,
         "loop_halve": 0x64,
         "sample_1": 0x69,
         "sample_2": 0x6A,
         "sample_3": 0x6B,
         "sample_4": 0x6C,
         "hotcue_1" : 0x71,
         "hotcue_2" : 0x72,
         "hotcue_3" : 0x73,
         "hotcue_delete" : 0x74,
         "fx1": 0x5D,
         "fx2": 0x5E,
         "fx3": 0x5F,
         "tap": 0x60,
         "sync" : 0x47,
         "cue" : 0x3C,
         "play_pause": 0x42,
         "stutter" : 0x4C}
    ];

	NumarkMixTrackProII.led_timer_ids = {};
	
	// for the flashing peak indicator
    NumarkMixTrackProII._flash_peak_state = [true, true];
    NumarkMixTrackProII._flash_peak_led_names = ["fx1", "fx2", "fx3", "tap"];	
	NumarkMixTrackProII._flash_peak_led_state = [0,0,0,1];

    // Turn off all the leds
    for (var deck_index in NumarkMixTrackProII.leds) {
        for (var led in NumarkMixTrackProII.leds[deck_index]) {
            NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck_index][led], false);
        }
    }
	
	NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[0]["file"], true);

    // set up each deck
    for (var d = 1; d <= 2; d++) {
        // Turn on some pad leds
        var led_names = ["loop_in", "loop_out", "scratch_mode", "tap"];
        for (var i in led_names) {
            NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[d][led_names[i]], true);
        }		

  	// Turn on fx1 effect rack led to match default mixxx initialisation which is set to true
    //NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[1]["fx1"], true);
    //NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[2]["fx1"], true);

    // Disable all the effect racks by default
    var c = "enabled";
    group = "[EffectRack1_EffectUnit1]"
    engine.setValue(group, c, 0); 
    group = "[EffectRack1_EffectUnit2]"
    engine.setValue(group, c, 0); 
    group = "[EffectRack1_EffectUnit3]"
    engine.setValue(group, c, 0); 
    group = "[EffectRack1_EffectUnit4]"
    engine.setValue(group, c, 0);    

		engine.setValue("[Channel"+d+"]", "keylock", NumarkMixTrackProII.isKeyLocked[d-1]);
		
        // Enable soft-takeover for Pitch slider
        engine.softTakeover("[Channel"+d+"]", "rate", true);
		
		// beat leds
        engine.connectControl("[Channel"+d+"]",
                              "beat_active",
                              "NumarkMixTrackProII.flash_beat_leds");
        // indicators
        engine.connectControl("[Channel"+d+"]",
                              "PeakIndicator",
                              "NumarkMixTrackProII.flash_peak_indicator");
		/* v.1.12 or above only */
        engine.connectControl("[Channel"+d+"]",
                              "play_indicator",
                              "NumarkMixTrackProII.flash_play_button");
        engine.connectControl("[Channel"+d+"]",
                              "cue_indicator",
                              "NumarkMixTrackProII.flash_cue_button");
			
    }
		
	engine.setValue("[Master]", "volume", 0);

}


NumarkMixTrackProII.flash_play_button = function(value, group, control) {
    //print("FLASHING PLAY BUTTON");
    var deck = NumarkMixTrackProII.groupToDeck(group);
    NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['play_pause'], value > 0);
}

NumarkMixTrackProII.flash_cue_button = function(value, group, control) {
    //print("FLASHING CUE BUTTON");
    var deck = NumarkMixTrackProII.groupToDeck(group);
    NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['cue'], value > 0);
}


/* flashed the stutter led on every beat.
 * Cue flashes when near the end of the song
 */
NumarkMixTrackProII.flash_beat_leds = function (value, group, control) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
	var secondsBlink = 30;
    var secondsToEnd = engine.getValue("[Channel"+deck+"]", "duration") * (1-engine.getValue("[Channel"+deck+"]", "playposition"));

    if (secondsToEnd < secondsBlink && secondsToEnd > 1 && engine.getValue("[Channel"+deck+"]", "play")) { // The song is going to end

         NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["cue"], value);
    }
    NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['stutter'], value);
    if (engine.getValue(group, 'loop_enabled') == "1") {
        // flash loop lights
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['loop_in'], value);
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['loop_out'], value);
    }
}


/* flashed the top row of lights when clipping */
NumarkMixTrackProII.flash_peak_indicator = function(value, group, control) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (value) {
		var led_names =NumarkMixTrackProII._flash_peak_led_names;
        for (var i in led_names) {
            NumarkMixTrackProII.setLED(
                NumarkMixTrackProII.leds[deck][led_names[i]], false);
        }
        var timer_id = engine.beginTimer(
            100, "NumarkMixTrackProII._flash_peak_indicator_once_deck_" + deck);
        NumarkMixTrackProII.led_timer_ids['peak_indicator_'+deck] = timer_id;		
    } else {
        engine.stopTimer(NumarkMixTrackProII.led_timer_ids['peak_indicator_'+deck]);
        print("stopped timer");
        // make sure the led's are back on
        NumarkMixTrackProII._flash_peak_state[deck] = false;
        var led_names =NumarkMixTrackProII._flash_peak_led_names;
        for (var i in led_names) {
            NumarkMixTrackProII.setLED(
                NumarkMixTrackProII.leds[deck][led_names[i]], NumarkMixTrackProII._flash_peak_led_state[i]);
        }		
    }
}

// can't send variables with timeouts
NumarkMixTrackProII._flash_peak_indicator_once_deck_1 = function() {
    NumarkMixTrackProII._flash_peak_indicator_once(1);
}

NumarkMixTrackProII._flash_peak_indicator_once_deck_2 = function() {
    NumarkMixTrackProII._flash_peak_indicator_once(2);
}

NumarkMixTrackProII._flash_peak_indicator_once = function(d) {
    // change state (off/on) and then display
    NumarkMixTrackProII._flash_peak_state[d] = !NumarkMixTrackProII._flash_peak_state[d];
    var led_names =NumarkMixTrackProII._flash_peak_led_names;
    for (var i in led_names) {
        NumarkMixTrackProII.setLED(
            NumarkMixTrackProII.leds[d][led_names[i]],
            NumarkMixTrackProII._flash_peak_state[d]);
    }
}

NumarkMixTrackProII.shutdown = function(id) {   // called when the MIDI device is closed
    NumarkMixTrackProII.turn_off_all_leds();
}

NumarkMixTrackProII.turn_off_all_leds = function() {
    // Turn off all the leds
    for (var deck_index in NumarkMixTrackProII.leds) {
        for (var led in NumarkMixTrackProII.leds[deck_index]) {
            NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck_index][led], false);
        }
    }
}


NumarkMixTrackProII.groupToDeck = function(group) {
    var matches = group.match(/^\[Channel(\d+)\]$/);
    if (matches == null) {
        return -1;
    } else {
        return matches[1];
    }
}


NumarkMixTrackProII.setLED = function(control, status) {
    midi.sendShortMsg(0x90, control, status ? 0x64 : 0x00);
}

NumarkMixTrackProII.selectKnob = function(channel, control, value, status, group) {
    if (value > 63) {
        value = value - 128;
    }
    if (NumarkMixTrackProII.directoryMode) {
        if (value > 0) {
            for (var i = 0; i < value; i++) {
                engine.setValue(group, "SelectNextPlaylist", 1);
            }
        } else {
            for (var i = 0; i < -value; i++) {
                engine.setValue(group, "SelectPrevPlaylist", 1);
            }
        }
    } else {
        engine.setValue(group, "SelectTrackKnob", value);

    }
}

NumarkMixTrackProII.pressKnob = function(channel, control, value, status, group) {    
		if (NumarkMixTrackProII.directoryMode)
		{
			// not working :(
			//engine.setValue(group, "ToggleSelectedSidebarItem", 1);
			
			// temporary function same as Back button
			NumarkMixTrackProII.backButton(channel, control, value, status, group);
		}
		else
		{
			engine.setValue(group, "LoadSelectedIntoFirstStopped", 1);
		}
}

NumarkMixTrackProII.backButton = function(channel, control, value, status, group) {
	// Toggle setting and light
    if (value) {
        NumarkMixTrackProII.directoryMode = !NumarkMixTrackProII.directoryMode;

        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[0]["directory"], NumarkMixTrackProII.directoryMode);
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[0]["file"], !NumarkMixTrackProII.directoryMode);		
    }
}

NumarkMixTrackProII.cuebutton = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (value && NumarkMixTrackProII.shift_is_pressed[deck-1]) {
        engine.setValue(group, "start", 1);
        engine.setValue(group, "cue_set", 1);
    }
    // Don't set Cue accidentaly at the end of the song
    if (engine.getValue(group, "playposition") <= 0.97) {
        engine.setValue(group, "cue_default", value ? 1 : 0);
    } else {
        engine.setValue(group, "cue_preview", value ? 1 : 0);
    }  	
	NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["cue"], 1);
}

NumarkMixTrackProII.beatsync = function(channel, control, value, status, group) {

    var deck = NumarkMixTrackProII.groupToDeck(group);

    if(NumarkMixTrackProII.shift_is_pressed[deck-1]){

        // Shift + SYNC = vuelve pitch a 0
		NumarkMixTrackProII.unsync(channel, control, value, status, group);

    } else {

		if (deck == 1) {
			// If the other deck is stopped, only sync tempo (not phase)
			if(!engine.getValue("[Channel2]", "play")) {
				engine.setValue(group, "beatsync_tempo", 1);
			} else {
					engine.setValue(group, "beatsync", 1);
				}
		}

		if (deck == 2) {
			// If the other deck is stopped, only sync tempo (not phase)
			if(!engine.getValue("[Channel1]", "play")) {
				engine.setValue(group, "beatsync_tempo", 1);					
			} else {
					engine.setValue(group, "beatsync", 1);
				}
		}		

		// Experimental : Sync button also adjust the beatgrid to match another playing deck. (for v.1.12 or above only)
		//engine.setValue(group, "beats_translate_match_alignment", 1);		
		
		NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["sync"], true);	
    }
}

NumarkMixTrackProII.unsync = function(channel, control, value, status, group) {
		var deck = NumarkMixTrackProII.groupToDeck(group);
        engine.softTakeover(group, "rate", false);
        engine.setValue(group, "rate", 0);
        engine.softTakeover(group, "rate", true);
		engine.setValue(group, "beatsync", 0);		
		NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["sync"], false);		
}


NumarkMixTrackProII.pitch = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
	
	var pitch_value = 0;

	if (value < 64) pitch_value = (value-64) /64;
	if (value > 64) pitch_value = (value-64) /63;

    engine.setValue("[Channel"+deck+"]", "rate", pitch_value);
    NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["rate"], value == 64);
}


NumarkMixTrackProII.jogWheel = function(channel, control, value, status, group) {    
	var deck = NumarkMixTrackProII.groupToDeck(group);

// 	if (!NumarkMixTrackPro.touch[deck-1] && !engine.getValue(group, "play")) return;

    var adjustedJog = parseFloat(value);
    var posNeg = 1;
    if (adjustedJog > 63) { // Counter-clockwise
        posNeg = -1;
        adjustedJog = value - 128;
    }

    if (engine.getValue(group, "play")) {

        if (NumarkMixTrackProII.scratch_mode[deck-1] && posNeg == -1 && !NumarkMixTrackProII.touch[deck-1]) {

            if (NumarkMixTrackProII.scratchTimer[deck-1] != -1) engine.stopTimer(NumarkMixTrackProII.scratchTimer[deck-1]);
            NumarkMixTrackProII.scratchTimer[deck-1] = engine.beginTimer(20, "NumarkMixTrackProII.jogWheelStopScratch(" + deck + ")", true);
        }

    } else { // en stop hace scratch siempre

        if (!NumarkMixTrackProII.touch[deck-1]){

            if (NumarkMixTrackProII.scratchTimer[deck-1] != -1) engine.stopTimer(NumarkMixTrackProII.scratchTimer[deck-1]);
            NumarkMixTrackProII.scratchTimer[deck-1] = engine.beginTimer(20, "NumarkMixTrackProII.jogWheelStopScratch(" + deck + ")", true);
        }

    }

    engine.scratchTick(deck, adjustedJog);

    if (engine.getValue(group,"play")) {
        var gammaInputRange = 13;   // Max jog speed
        var maxOutFraction = 0.8;   // Where on the curve it should peak; 0.5 is half-way
        var sensitivity = 0.5;      // Adjustment gamma
        var gammaOutputRange = 2;   // Max rate change

        adjustedJog = posNeg * gammaOutputRange * Math.pow(Math.abs(adjustedJog) / (gammaInputRange * maxOutFraction), sensitivity);
        engine.setValue(group, "jog", adjustedJog);
    }

}


NumarkMixTrackProII.jogWheelStopScratch = function(deck) {
    NumarkMixTrackProII.scratchTimer[deck-1] = -1;
    engine.scratchDisable(deck);

	//if (NumarkMixTrackProII.isKeyLocked[deck-1]) {
		engine.setValue("[Channel"+deck+"]", "keylock", 1);
	//}

}

NumarkMixTrackProII.wheelTouch = function(channel, control, value, status, group){

    var deck = NumarkMixTrackProII.groupToDeck(group);

    if(!value){

        NumarkMixTrackProII.touch[deck-1]= false;

//  paro el timer (si no existe da error mmmm) y arranco un nuevo timer.
//  Si en 20 milisegundos no se mueve el plato, desactiva el scratch

        if (NumarkMixTrackProII.scratchTimer[deck-1] != -1) engine.stopTimer(NumarkMixTrackProII.scratchTimer[deck-1]);

        NumarkMixTrackProII.scratchTimer[deck-1] = engine.beginTimer(20, "NumarkMixTrackProII.jogWheelStopScratch(" + deck + ")", true);

    } else {

        // si esta en play y el modo scratch desactivado, al presionar el touch no hace nada
        if (!NumarkMixTrackProII.scratch_mode[deck-1] && engine.getValue(group, "play")) return;

        // Save the current state of the keylock
        NumarkMixTrackProII.isKeyLocked[deck-1] = engine.getValue(group, "keylock");
        // Turn the Keylock off for scratching
        if (NumarkMixTrackProII.isKeyLocked[deck-1]){
            engine.setValue(group, "keylock", 0);
        }


        if (NumarkMixTrackProII.scratchTimer[deck-1] != -1) engine.stopTimer(NumarkMixTrackProII.scratchTimer[deck-1]);

        // change the 600 value for sensibility
        engine.scratchEnable(deck, 600, 33+1/3, 1.0/8, (1.0/8)/32);

        NumarkMixTrackProII.touch[deck-1]= true;
    }
}

NumarkMixTrackProII.toggleScratchMode = function(channel, control, value, status, group) {
    if (!value) return;

    var deck = NumarkMixTrackProII.groupToDeck(group);
    // Toggle setting and light
    NumarkMixTrackProII.scratch_mode[deck-1] = !NumarkMixTrackProII.scratch_mode[deck-1];
    NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["scratch_mode"], NumarkMixTrackProII.scratch_mode[deck-1]);
}


/* Shift key pressed/unpressed - toggle shift status in controller object
 * so that other buttons can detect if shift button is currently held down
 */
NumarkMixTrackProII.shift = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    NumarkMixTrackProII.shift_is_pressed[deck-1] = value == 0x7f ? true : false;
}

/* if shift is held down: toggle keylock
 * else: temporarily bend the pitch down
 */
NumarkMixTrackProII.pitch_bend_down_or_keylock = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (NumarkMixTrackProII.shift_is_pressed[deck-1]) {
        // toggle keylock (only on press down)
        if (value > 0) {
            var current_keylock_value = engine.getValue(group, 'keylock');
            engine.setValue(group, 'keylock', !current_keylock_value);
        }
    } else {
        // temp pitch down
        engine.setValue(group, 'rate_temp_down', value == 0 ? 0 : 1);
    }
}

NumarkMixTrackProII.pitch_bend_up_or_range = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (NumarkMixTrackProII.shift_is_pressed[deck-1]) {
        // cycle slider range
        if (value > 0) {
            var psri = NumarkMixTrackProII.pitch_slider_range_index;
            var psr = NumarkMixTrackProII.pitch_slider_ranges;
            NumarkMixTrackProII.pitch_slider_range_index = (psri + 1) % psr.length;
            //print("setting rate to " + psr[psri]);
            engine.setValue(group, 'rateRange', psr[psri]);
        }
    } else {
        // temp pitch down
        engine.setValue(group, 'rate_temp_up', value > 0 ? 1 : 0);
    }
}


/* All hotcue buttons come here, enable/disable hotcues 1 to 3, toggle delete
 * with the fourth button.
 * LED comes on when there is a hotcue set for that pad.
 * It would be nice if they flashed when the delete button was turned on.
 */
NumarkMixTrackProII.hotcue = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    var cue_midi_controls = [[0x6D, 0x6E, 0x6F], [0x71, 0x72, 0x73]];
    var cue_num = cue_midi_controls[deck-1].indexOf(control) + 1;
    if (value && (control == 0x70 || control == 0x74)) {
        // toggle cue delete mode and it's LED
        NumarkMixTrackProII.cue_delete_mode[deck-1] = !NumarkMixTrackProII.cue_delete_mode[deck-1];
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["hotcue_delete"],
                                   NumarkMixTrackProII.cue_delete_mode[deck-1]);
    } else if (value && NumarkMixTrackProII.cue_delete_mode[deck-1]) {
        // clear the cue and exit delete mode
        engine.setValue(group, 'hotcue_'+cue_num+'_clear', value);
        NumarkMixTrackProII.cue_delete_mode[deck-1] = false;
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["hotcue_delete"], false);
    } else if (cue_num >= 1) {
        engine.setValue(group, 'hotcue_'+cue_num+'_activate', value);
    }
}


/* reloop exit causes loop_in and loop_out to flash in beat when loop is on */
NumarkMixTrackProII.reloop_exit = function(channel, control, value, status, group) {
    if (value) {
        var deck = NumarkMixTrackProII.groupToDeck(group);
        engine.setValue(group, 'reloop_exit', 1);
        // turn loop lights back on
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['loop_in'], true);
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['loop_out'], true);
    }
}


/* loop out sends the loop_out command, as you would expect, then tests
 * to see if the loop is enabled. If it is, then set the global variable
 * so that the led's can flash
 */
NumarkMixTrackProII.loop_out = function(channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, 'loop_out', 1);
        var deck = NumarkMixTrackProII.groupToDeck(group);
        // turn loop lights off
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['loop_in'], false);
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['loop_out'], false);
    }
}


/* loop_halve unless shift_is_pressed, then double loop */
NumarkMixTrackProII.loop_halve = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (value && NumarkMixTrackProII.shift_is_pressed[deck-1]) {
        engine.setValue(group, 'loop_double', 1);
    } else if (value) {
        engine.setValue(group, 'loop_halve', 1);
    }
}

/* loop_halve unless shift_is_pressed, then double loop */
NumarkMixTrackProII.filter = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);

    if(NumarkMixTrackProII.shift_is_pressed[deck-1]){
      // script.midiDebug(deck, channel, control, value, status, group);

      var c = "super1"
      var group = "[QuickEffectRack1_" + group + "]";
       
       engine.setValue(group, c, value / 128);
       // engine.setParameter(group, c, value /128); 
    }
    else
    {
        var group = "[EqualizerRack1_" + group + "_Effect1]";
        var c = "parameter1"     

        // script.midiDebug(deck, channel, control, value, status, group);
        engine.setParameter(group, c, value /128);              
    }
}


/* loop_halve unless shift_is_pressed, then double loop */
NumarkMixTrackProII.fxKnobs = function(channel, control, value, status, group) {

  var deck = NumarkMixTrackProII.groupToDeck(group);


  /* variations */
  //var group = "[QuickEffectRack1_[Channel1]]";
  // var group = "[EqualizerRack1_[Channel1]_Effect1]";
  //var group = "[EffectRack1_EffectUnit1_Effect1]";
  // script.midiDebug(channel, control, value, status, group);

  /* Shift + fx1 controls deck super button
   */
  if(NumarkMixTrackProII.shift_is_pressed[deck-1]){
    // script.midiDebug(deck, channel, control, value, status, group);
    if (control == 0x1B || control == 0x1E)

    /* var group = "[EffectRack1_EffectUnit1]";
     * var c = "super1"
     * super knob - controls all effects in a specified rack
     */
     var c = "super1"
     group = "[EffectRack1_EffectUnit" + deck + "]";
     var paramVal = engine.getParameter(group, c);
     if (value == 0x01) { //value is increasing
         paramVal = paramVal+0.05;
      } else { //going down
         paramVal = paramVal-0.05;
      }
      //engine.setValue(group, c, paramVal);
      engine.setParameter(group, c, paramVal);
  }
  else {
    var group = null
    if(deck == 1)
      var group = "[EffectRack1_EffectUnit1_Effect1]";
    else if(deck == 2)
      var group = "[EffectRack1_EffectUnit2_Effect1]";


    var c = "parameter1";
    if (control == 0x1B || control == 0x1E)
      c = "parameter1";
    else if (control == 0x1C || control == 0x1F)
      c = "parameter2";
    else if (control == 0x1D || control == 0x20)
      c = "parameter3";

     //get current value
     //var paramVal = engine.getValue(group, c);
     var paramVal = engine.getParameter(group, c); // use getParameter instead of getValue

     if (value == 0x01) { //value is increasing
         paramVal = paramVal+0.05;
      } else { //going down
         paramVal = paramVal-0.05;
      }

     //set the value
     //engine.setValue(group, c, paramVal);
     engine.setParameter(group, c, paramVal); // use setParameter instead of getValue
                                              // if setValue flanger para2, para3 knobs dont work
  }                                            
}


/* if shift_is_pressed: fx else: auto-loop */
NumarkMixTrackProII.fx1_or_auto1 = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (value && NumarkMixTrackProII.shift_is_pressed[deck-1]) {
        engine.setValue(group, 'beatloop', 1);
    } else if (value) {
      /* This no longer works */
        //var c = "flanger";
        //var kill = !engine.getValue(group, c);
        //engine.setValue(group, c, kill);      

        var c = "enabled";
        if (control == 0x59)
          group = "[EffectRack1_EffectUnit1]";
        else if (control == 0x5D)
          group = "[EffectRack1_EffectUnit2]";
        var kill = !engine.getValue(group, c);
        engine.setValue(group, c, kill);         

        
		NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['fx1'], kill == "1");
		NumarkMixTrackProII._flash_peak_led_state[0] = kill == "1";
    }
}

NumarkMixTrackProII.fx2_or_auto2 = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (value && NumarkMixTrackProII.shift_is_pressed[deck-1]) {
        engine.setValue(group, 'beatloop', 2);
    } else if (value) {
        var c = "filterHighKill";
        var kill = !engine.getValue(group, c);
        engine.setValue(group, c, kill);
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['fx2'], kill == "1");
		NumarkMixTrackProII._flash_peak_led_state[1] = kill == "1";
    }
}

NumarkMixTrackProII.fx3_or_auto4 = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (value && NumarkMixTrackProII.shift_is_pressed[deck-1]) {
        engine.setValue(group, 'beatloop', 4);
    } else if (value) {
        var c = "filterLowKill";
        var kill = !engine.getValue(group, c);
        engine.setValue(group, c, kill);
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['fx3'], kill == "1");
		NumarkMixTrackProII._flash_peak_led_state[2] = kill == "1";
    }
}

NumarkMixTrackProII.tap_or_auto16 = function(channel, control, value, status, group) {
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (value && NumarkMixTrackProII.shift_is_pressed[deck-1]) {
        engine.setValue(group, 'beatloop', 16);
    } else if (value) {
        engine.setValue(group, 'bpm_tap', 1);
        NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['tap'], true);
		NumarkMixTrackProII._flash_peak_led_state[3] = 1;
    }
	else {
		engine.setValue(group, 'bpm_tap', 0);
		NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]['tap'], false);
		NumarkMixTrackProII._flash_peak_led_state[3] = 0;
	}
}


/* load selected track also turns on this channels pre-fader cue */
NumarkMixTrackProII.load_selected_track = function(channel, control, value, status, group) {
	var deck = NumarkMixTrackProII.groupToDeck(group);
	
	// Load the selected track in the corresponding deck only if the track is paused
	if (value && engine.getValue(group, "play") != 1) 
	{
        engine.setValue(group, "pfl", 1);
        engine.setValue(group, "LoadSelectedTrack", 1);	
		engine.setValue(group, 'keylock', 1);		
		NumarkMixTrackProII.unsync(channel, control, value, status, group);
		NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["cue"], 1);
		NumarkMixTrackProII.setLED(NumarkMixTrackProII.leds[deck]["stutter"], 1);		
    }
}


NumarkMixTrackProII.play = function(channel, control, value, status, group) {
	if (!value) return;
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (NumarkMixTrackProII.shift_is_pressed[deck-1] && engine.getValue(group, "play")) {
		var speed = 1.2;
		if (engine.getValue("[Flanger]","lfoDelay") < 5026) {
			speed = engine.getValue("[Flanger]","lfoDelay") / 5025;
			if (speed < 0) speed = 0;
		} else {
			speed = (engine.getValue("[Flanger]","lfoDelay") - 5009)/ 16,586666667
			if (speed > 300) speed = 300;
		}
		engine.brake(deck, value, speed);
    } else {
		if (engine.getValue(group, "play"))
			engine.setValue(group, 'play', 0);
		else
			engine.setValue(group, 'play', 1);
    }
}


NumarkMixTrackProII.stutter = function(channel, control, value, status, group) {
	if (!value) return;
    var deck = NumarkMixTrackProII.groupToDeck(group);
    if (NumarkMixTrackProII.shift_is_pressed[deck-1] && engine.getValue(group, "play")) {
		// spin back
        engine.brake(deck, value > 0, 1.2, -10); // start at a rate of -10 and decrease at a factor of 1.2
    } else {
        engine.setValue(group, 'cue_gotoandplay', 1);        
    }
}
