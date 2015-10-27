node tests/performance/fileGenerator.js 1 1Byte;
node tests/performance/fileGenerator.js 1024 1KByte;
node tests/performance/fileGenerator.js 1048576 1MByte;
mocha --compilers js:babel/register tests/performance/performanceTest.js
mocha --compilers js:babel/register tests/performance/performanceJSON.js



