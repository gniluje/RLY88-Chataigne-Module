//For more information, check https://www.robot-electronics.co.uk/htm/usb_opto_rly88tech.htm

var inputNumber = 8;
var outputNumber = 8;

var RLY88ID = 12; //RLY88 specific ID given by the vendor

var ModuleID = -1; //Module ID which is 12 for the RLY88
var BoardID = -1;  //Unique Board ID which is 12 for the RLY88

var IODataMuxer = 0; //0 : Input ---  1 : Output - Data muxer to prevent serial message missing

script.updateRate.set(100); //update rate set to 50, could be decreased a bit if heavy serial load

function init() {
    ModuleID = -1;
    BoardID = -1;
    script.log("RLY88 module init done");
}

function moduleParameterChanged(param) { //event trigged when a parameter is modified

    if (param.isParameter()) { //parameter change management
        script.log(param.name + " parameter changed, new value: " + param.get());

        if (param.is(local.parameters.isConnected)) {
            //Disconnection management 
            if (param.get() == 0) {
                ModuleID = -1; //reset Module ID 
                BoardID = -1;  //reset Board ID 
                local.values.inputs.setCollapsed(true);  //hide input values
                local.values.outputs.setCollapsed(true); //hide output values
            }      
        }

    } else { //trigger click management
        script.log(param.name + " trigger clicked");
        if (param.is(local.parameters.allRelaysOn)) { //trigger enabling to set all the relays ON
            local.sendBytes(100); //serial command 100 set all the relay to ON state
        } else if (param.is(local.parameters.allRelaysOff)) { //trigger enabling to set all the relays OFF
            local.sendBytes(110); //serial command 110 set all the relay to OFF state
        }
    }
}

function moduleValueChanged(value) { //event trigged when a value is modified
    script.log(value.name + " value changed, new value: " + value.get());

    if (value.name.substring(0, 6) == "output") { //output value change management
        var cmd = 110 + parseInt(value.name.substring(6, 7)) - value.get() * 10; //build integer which will be sent through serial to change state of specific relay
        script.log("sending command : " + cmd);
        local.sendBytes(cmd);
    }
}

function update(deltaTime) { //loop function, delta time can be changed thanks to : script.updateRate.set([your update rate]);
    if (local.parameters.isConnected.get()) {
        if (ModuleID != RLY88ID) {  //try to get a potential Module ID
            local.sendBytes(90);
        } else if (BoardID == -1) { //if Module ID is 12 (RLY88 confirmed), get board number
            local.sendBytes(56);
        } else {                    //if RLY88 is confirmed with its board number, send alternatively a message to get input and output states
            local.sendBytes(!IODataMuxer * 26 + IODataMuxer * 91); //26 returns an array of 8 bytes descibing inputs states, 91 returs 1 byte that decribes output states (binary)
        }
    }
}

function dataReceived(data) { //serial received management
    
    //script.log("data received : " + data + " data length : " + data.length);
    if (ModuleID != RLY88ID) { //Module ID message handling
        local.parameters.boardID.set("No RLY88 board detected");
        if (data.length == 2) {
            script.log("ModuleID received : " + data[0]);
            ModuleID = data[0];
        }

    } else if (BoardID == -1) { //Board ID message handling
        if (data.length == 8) {
            script.log("RLY88 Board ID data received : " + data.join());
            BoardID = data.join();
            local.parameters.boardID.set(BoardID);
            local.values.inputs.setCollapsed(false);
            local.values.outputs.setCollapsed(false);
        }
    } else { //IO muxed messages handling
        if (IODataMuxer == 0 && data.length == inputNumber) { //Inputs related message handling
            for (var i = 0; i < data.length; i++) {
                //script.log(local.values.inputs.getChild('Input ' + (i + 1)).name);
                local.values.inputs.getChild('Input ' + (i + 1)).set(data[i] / 255);
            }
        } else if (IODataMuxer == 1 && data.length == 1) { //Outputs related message handling
            //script.log("data received : " + data[0]);
			var boolstate = 0;
            for (var i = 0; i < outputNumber; i++) {
                boolstate = (data[0] >> i) & 0x01;
				//check if there is a difference between chataigne relay state and board relay state in order to resync states if problem
				if(boolstate != local.values.outputs.getChild('Output ' + (i + 1)).get()){	
					local.values.outputs.getChild('Output ' + (i + 1)).set(boolstate);
				}
            }
        }
        IODataMuxer = IODataMuxer;
    }
}