//For more information, check https://www.robot-electronics.co.uk/htm/usb_opto_rly88tech.htm

var inputNumber = 8;
var outputNumber = 8;

var currentInputStates = [0, 0, 0, 0, 0, 0, 0, 0];
var currentOutputStates = [0, 0, 0, 0, 0, 0, 0, 0];

var rcvDataInputStates = [0, 0, 0, 0, 0, 0, 0, 0];
var rcvDataOutputStates = [0, 0, 0, 0, 0, 0, 0, 0];

var allRelayTrigger = 0;
var noRelayTrigger = 0;

var RLY88ID = 12; //RLY88 specific ID given by the vendor

var ModuleID = -1; //Module ID which is 12 for the RLY88
var BoardID = -1;  //Unique Board ID which is 12 for the RLY88

var IODataMuxer = 0; //0 : Input ---  1 : Output - Data muxer to prevent serial message missing

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
        } else if (param.is(local.parameters.updateRate)) {
            script.updateRate.set(param.get()); //update rate parameter management, could be decreased a bit if heavy serial load
        }

    } else { //trigger click management
        script.log(param.name + " trigger clicked");
        if (param.is(local.parameters.allRelaysOn)) { //trigger enabling to set all the relays ON
            allRelayTrigger = 1;
        } else if (param.is(local.parameters.allRelaysOff)) { //trigger enabling to set all the relays OFF
            noRelayTrigger = 1;
        }
    }
}

function moduleValueChanged(value) { //event trigged when a value is modified
    script.log(value.name + " value changed, new value: " + value.get());
}

function update(deltaTime) { //loop function, delta time can be changed thanks to : script.updateRate.set([your update rate]);
    if (local.parameters.isConnected.get()) {
        if (ModuleID != RLY88ID) {  //try to get a potential Module ID
            local.sendBytes(90);
        } else if (BoardID == -1) { //if Module ID is 12 (RLY88 confirmed), get board number and reset relay to off
            local.sendBytes(56);
            local.sendBytes(110);
        } else {                    //if RLY88 is confirmed with its board number, send alternatively a message to get input and output states
            local.sendBytes(!IODataMuxer * 26 + IODataMuxer * 91); //26 returns an array of 8 bytes descibing inputs states, 91 returs 1 byte that decribes output states (binary)
        }

        if (allRelayTrigger) {
            local.sendBytes(100); //serial command 100 set all the relay to ON state
            for (var i = 0; i < outputNumber; i++) {
                local.values.outputs.getChild('Output ' + (i + 1)).set(1);
            }
            currentOutputStates = [1, 1, 1, 1, 1, 1, 1, 1];
            rcvDataOutputStates = [1, 1, 1, 1, 1, 1, 1, 1];
            allRelayTrigger = 0;
        } else if (noRelayTrigger) {
            local.sendBytes(110); //serial command 100 set all the relay to ON state
            for (var i = 0; i < outputNumber; i++) {
                local.values.outputs.getChild('Output ' + (i + 1)).set(0);
            }
            currentOutputStates = [0, 0, 0, 0, 0, 0, 0, 0];
            rcvDataOutputStates = [0, 0, 0, 0, 0, 0, 0, 0];
            noRelayTrigger = 0;
        } else{

            //script.log("I data received : " + rcvDataInputStates.join());
            //script.log("O data received : " + rcvDataOutputStates.join());

            if (!IODataMuxer) {//Input states update
                inputStateUpdate();

            } else { //Output states update;
                outputStateUpdate();  
            }
            //script.log("Current Input array = " + currentInputStates.join());
            //script.log("Current Output array = " + currentOutputStates.join()); 
        }
    }
}

function inputStateUpdate() { //Update input states in regards to the states get by serial message
    for (var i = 0; i < inputNumber; i++) {
        local.values.inputs.getChild('Input ' + (i + 1)).set(rcvDataInputStates[i]);
        currentInputStates[i] = rcvDataInputStates[i];
    }
}

function outputStateUpdate() { //Send serial command to update the relay states in regards to the GUI command
    for (var i = 0; i < outputNumber; i++) {
        currentOutputStates[i] = local.values.outputs.getChild('Output ' + (i + 1)).get();
        if (rcvDataOutputStates[i] != currentOutputStates[i]) {
            var cmd = 110 + (i + 1) - currentOutputStates[i] * 10; //build integer which will be sent through serial to change state of specific relay
            local.sendBytes(cmd);
            //script.log("cmd sent : " + cmd);
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
        script.log("IODataMuxer : " + IODataMuxer);
        if (data.length == inputNumber && IODataMuxer == 0) { //Inputs related message handling
            script.log("Receive Input");
            for (var i = 0; i < data.length; i++) {
                rcvDataInputStates[i] = data[i] ? 1 : 0;
            }
            IODataMuxer = 1; //Input message received, output request can be sent
        } else if (data.length == 1 && IODataMuxer == 1) { //Outputs related message handling
            script.log("Receive Output");
            for (var i = 0; i < outputNumber; i++) {
                var boolstate = (data[0] >> i) & 0x01;
                rcvDataOutputStates[i] = (data[0] >> i) & 0x01;
            }
            IODataMuxer = 0;//Output message received, input request can be sent
        }
    } 
}

function setRelayState(relayNumber, stateWanted){
    local.values.outputs.getChild('Output ' + (relayNumber)).set(stateWanted);
}

function toggleRelay(relayNumber){
    var newState = !(local.values.outputs.getChild('Output ' + (relayNumber)).get());
    local.values.outputs.getChild('Output ' + (relayNumber)).set(newState);
}