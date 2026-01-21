/**
 * Example usage of the HL7 to FHIR Converter Library
 * 
 * Note: This example assumes hl7-parser is installed and available
 */

import { 
  convertHL7ToFHIR, 
  validateHL7Message, 
  getSampleADTMessage
} from './src/hl7ToFhirService.js';

// Example 1: Using the sample message
console.log('=== Example 1: Sample ADT Message ===\n');
const sampleMessage = getSampleADTMessage();
console.log('Original HL7 Message:');
console.log(sampleMessage.substring(0, 200) + '...');
console.log('\n---\n');

if (validateHL7Message(sampleMessage)) {
  const bundle = convertHL7ToFHIR(sampleMessage);
  
  console.log('FHIR Bundle Created:');
  console.log(`  Type: ${bundle.type}`);
  console.log(`  Timestamp: ${bundle.timestamp}`);
  console.log(`  Total Resources: ${bundle.entry.length}`);
  console.log('\n---\n');
  
  console.log('Resources in Bundle:');
  const resourceCounts = {};
  bundle.entry.forEach(entry => {
    const resourceType = entry.resource.resourceType;
    resourceCounts[resourceType] = (resourceCounts[resourceType] || 0) + 1;
  });
  
  Object.entries(resourceCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  console.log('\n---\n');
  console.log('Sample Patient Resource:');
  const patient = bundle.entry.find(e => e.resource.resourceType === 'Patient');
  if (patient) {
    console.log(JSON.stringify(patient.resource, null, 2));
  }
} else {
  console.error('Invalid HL7 message');
}

console.log('\n\n');

// Example 2: Simple custom message
console.log('=== Example 2: Custom Message ===\n');
const customMessage = `MSH|^~\\&|SendingApp|SendingFacility|ReceivingApp|ReceivingFacility|20240101120000||ADT^A01^ADT_A01|12345|P|2.5
PID|1||MRN123456789^^^HOSPITAL^MR||DOE^JOHN^MIDDLE^JR^^L||19800115|M|||123 MAIN ST^^CITY^ST^12345^USA||555-123-4567
PV1|1|I|ICU^101^A|||123456^DOCTOR^JOHN^MD^^MD|||||V123456||20240101100000|20240101120000`;

console.log('Original HL7 Message:');
console.log(customMessage);
console.log('\n---\n');

if (validateHL7Message(customMessage)) {
  const bundle = convertHL7ToFHIR(customMessage);
  
  console.log('FHIR Bundle Summary:');
  console.log(`  Total Resources: ${bundle.entry.length}`);
  bundle.entry.forEach(entry => {
    const resource = entry.resource;
    console.log(`\n  ${resource.resourceType} (${resource.id}):`);
    
    if (resource.resourceType === 'Patient') {
      console.log(`    Name: ${resource.name?.[0]?.family}, ${resource.name?.[0]?.given?.join(' ')}`);
      console.log(`    Gender: ${resource.gender}`);
      console.log(`    Birth Date: ${resource.birthDate}`);
      console.log(`    Identifiers: ${resource.identifier?.length || 0}`);
    } else if (resource.resourceType === 'Encounter') {
      console.log(`    Status: ${resource.status}`);
      console.log(`    Class: ${resource.class?.display}`);
      console.log(`    Period: ${resource.period?.start} to ${resource.period?.end || 'ongoing'}`);
    } else if (resource.resourceType === 'MessageHeader') {
      console.log(`    Event: ${resource.event?.code}`);
      console.log(`    Timestamp: ${resource.timestamp}`);
    }
  });
} else {
  console.error('Invalid HL7 message');
}

console.log('\n\n');

// Example 3: Accessing specific resources
console.log('=== Example 3: Accessing Specific Resources ===\n');
if (validateHL7Message(sampleMessage)) {
  const bundle = convertHL7ToFHIR(sampleMessage);
  
  // Find Patient resource
  const patient = bundle.entry.find(e => e.resource.resourceType === 'Patient');
  if (patient) {
    console.log('Patient Resource:');
    console.log(`  ID: ${patient.resource.id}`);
    console.log(`  Name: ${patient.resource.name?.[0]?.family}, ${patient.resource.name?.[0]?.given?.join(' ')}`);
    console.log(`  Gender: ${patient.resource.gender}`);
    console.log(`  Birth Date: ${patient.resource.birthDate}`);
    console.log(`  Identifiers: ${patient.resource.identifier?.length || 0}`);
  }
  
  // Find all Observations
  const observations = bundle.entry.filter(e => e.resource.resourceType === 'Observation');
  console.log(`\nObservation Resources: ${observations.length}`);
  observations.forEach((entry, index) => {
    const obs = entry.resource;
    console.log(`\n  Observation ${index + 1}:`);
    console.log(`    Code: ${obs.code?.coding?.[0]?.display || obs.code?.text || 'Unknown'}`);
    if (obs.valueQuantity) {
      console.log(`    Value: ${obs.valueQuantity.value} ${obs.valueQuantity.unit || ''}`);
    } else if (obs.valueString) {
      console.log(`    Value: ${obs.valueString}`);
    }
    if (obs.referenceRange) {
      console.log(`    Reference Range: ${obs.referenceRange[0]?.text || 
        `${obs.referenceRange[0]?.low?.value}-${obs.referenceRange[0]?.high?.value}`}`);
    }
  });
  
  // Find Encounters
  const encounters = bundle.entry.filter(e => e.resource.resourceType === 'Encounter');
  console.log(`\nEncounter Resources: ${encounters.length}`);
  encounters.forEach((entry, index) => {
    const enc = entry.resource;
    console.log(`\n  Encounter ${index + 1}:`);
    console.log(`    Status: ${enc.status}`);
    console.log(`    Class: ${enc.class?.display}`);
    console.log(`    Period: ${enc.period?.start} to ${enc.period?.end || 'ongoing'}`);
  });
}

console.log('\n\n');

// Example 4: Full JSON output
console.log('=== Example 4: Full FHIR Bundle JSON ===\n');
if (validateHL7Message(customMessage)) {
  const bundle = convertHL7ToFHIR(customMessage);
  console.log(JSON.stringify(bundle, null, 2));
}
