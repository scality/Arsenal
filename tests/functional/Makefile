KINETIC_JAVA = ../dependencies/kinetic-java
SIMULATOR = $(KINETIC_JAVA)/bin/startSimulator.sh
SIMULATOR_POM = $(KINETIC_JAVA)/pom.xml
SIMULATOR_JAR = $(KINETIC_JAVA)/kinetic-simulator/target/kinetic-simulator-0.8.0.5-SNAPSHOT.jar
SIMULATOR_PID = kinetic-simulator.pid

default: test

.PHONY:
submodule_sync:
	git submodule sync
	git submodule update --init

$(SIMULATOR_POM): submodule_sync
$(SIMULATOR): submodule_sync

$(SIMULATOR_JAR): $(SIMULATOR_POM)
	mvn clean package -f $(SIMULATOR_POM)

.PHONY:
start_simulator: $(SIMULATOR_PID)
$(SIMULATOR_PID): $(SIMULATOR) $(SIMULATOR_JAR)
	sh $< & echo "$$!" >$@
.PHONY:
stop_simulator: $(SIMULATOR_PID)
	kill $$(cat $<); rm $<

.PHONY:
run_tests:
	cd ../.. && \
	  mocha --compilers js:babel/register tests/functional/simulTest.js
.PHONY:
test: start_simulator run_tests stop_simulator
