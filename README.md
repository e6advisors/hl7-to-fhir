# HL7 to FHIR Converter Library

A comprehensive JavaScript library for converting HL7 v2.x messages into FHIR R4-compliant resources. This library provides extensive mapping of HL7 segments to FHIR resources following HL7 FHIR mapping guidelines and industry best practices.

## Features

- **Comprehensive Segment Mapping**: Converts all major HL7 segments to corresponding FHIR resources
- **FHIR R4 Compliant**: Produces FHIR R4-compliant resources following official specifications
- **US Core Profiles**: Supports US Core profiles for Patient and other resources
- **Terminology Mapping**: Proper mapping from HL7 v2 codes to FHIR code systems (LOINC, SNOMED CT, ICD-10, CPT, etc.)
- **Multiple Resource Types**: Creates MessageHeader, Patient, Encounter, RelatedPerson, Observation, AllergyIntolerance, Condition, Procedure, Coverage, and more
- **Reference Management**: Properly links resources with references (Patient → Encounter, Encounter → Observation, etc.)
- **Repetition Handling**: Handles repeated fields and multiple values correctly
- **Complex Data Structures**: Supports components, sub-components, and nested structures
- **Zero Dependencies**: Only requires the `hl7-parser` package for parsing HL7 messages

## Supported HL7 Segments → FHIR Resources

| HL7 Segment | FHIR Resource | Description |
|------------|---------------|-------------|
| MSH | MessageHeader | Message metadata, source, destination, event type |
| PID | Patient | Comprehensive patient demographics, identifiers, race, ethnicity, contact info |
| PV1 | Encounter | Visit information, location, dates, providers, financial class, discharge disposition |
| NK1 | RelatedPerson | Next of kin, emergency contacts, relationships |
| OBX | Observation | Clinical observations, lab results with reference ranges, interpretation, methods |
| AL1 | AllergyIntolerance | Allergies with severity, reactions, and identification dates |
| DG1 | Condition | Diagnoses with coding systems, types, and onset dates |
| PR1 | Procedure | Procedures with codes, dates, and performers |
| IN1/IN2 | Coverage | Insurance information, policy details, coverage periods |

## Installation

### Node.js

```bash
npm install hl7-to-fhir hl7-parser
```

Or copy the `src/hl7ToFhirService.js` file directly into your project along with the `hl7-parser` package.

### Browser

Include both libraries in your HTML (after bundling):

```html
<script src="hl7ParserService.js"></script>
<script src="hl7ToFhirService.js"></script>
```

## Usage

### Basic Usage

```javascript
import { convertHL7ToFHIR, validateHL7Message } from 'hl7-to-fhir';
// Note: hl7-parser must also be installed and available

// Your HL7 message
const hl7Message = `MSH|^~\\&|SendingApp|SendingFacility|ReceivingApp|ReceivingFacility|20240101120000||ADT^A01^ADT_A01|12345|P|2.5
PID|1||MRN123456789^^^HOSPITAL^MR||DOE^JOHN^MIDDLE^JR^^L||19800115|M|||123 MAIN ST^^CITY^ST^12345^USA||555-123-4567`;

// Validate the message
if (validateHL7Message(hl7Message)) {
  // Convert to FHIR
  const fhirBundle = convertHL7ToFHIR(hl7Message);
  console.log(JSON.stringify(fhirBundle, null, 2));
} else {
  console.error('Invalid HL7 message format');
}
```

### Example Output

**Input (HL7):**
```
MSH|^~\\&|SendingApp|SendingFacility|ReceivingApp|ReceivingFacility|20240101120000||ADT^A01^ADT_A01|12345|P|2.5
PID|1||MRN123456789^^^HOSPITAL^MR||DOE^JOHN^MIDDLE^JR^^L||19800115|M|||123 MAIN ST^^CITY^ST^12345^USA||555-123-4567
```

**Output (FHIR Bundle):**
```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "entry": [
    {
      "fullUrl": "urn:uuid:message-12345",
      "resource": {
        "resourceType": "MessageHeader",
        "id": "message-12345",
        "event": {
          "system": "http://terminology.hl7.org/CodeSystem/v2-0003",
          "code": "A01"
        },
        "timestamp": "2024-01-01T12:00:00",
        "source": {
          "name": "SendingApp",
          "endpoint": "urn:oid:SendingFacility"
        }
      }
    },
    {
      "fullUrl": "urn:uuid:patient-1",
      "resource": {
        "resourceType": "Patient",
        "id": "patient-1",
        "meta": {
          "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"]
        },
        "identifier": [
          {
            "value": "MRN123456789",
            "system": "urn:oid:HOSPITAL",
            "type": {
              "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                "code": "MR",
                "display": "Medical Record Number"
              }]
            }
          }
        ],
        "name": [{
          "use": "official",
          "family": "DOE",
          "given": ["JOHN", "MIDDLE"],
          "suffix": ["JR"]
        }],
        "gender": "male",
        "birthDate": "1980-01-15",
        "address": [{
          "use": "home",
          "line": ["123 MAIN ST"],
          "city": "CITY",
          "state": "ST",
          "postalCode": "12345",
          "country": "USA"
        }],
        "telecom": [{
          "system": "phone",
          "value": "555-123-4567",
          "use": "home"
        }]
      }
    }
  ]
}
```

## API Reference

### `convertHL7ToFHIR(hl7Message)`

Converts an HL7 message to a FHIR Bundle containing all converted resources.

**Parameters:**
- `hl7Message` (string): The raw HL7 message string

**Returns:**
- `Object`: FHIR Bundle object containing:
  - `resourceType`: "Bundle"
  - `type`: "collection"
  - `timestamp`: ISO timestamp
  - `entry`: Array of bundle entries, each containing:
    - `fullUrl`: Unique identifier for the resource
    - `resource`: The FHIR resource object

**Throws:**
- `Error`: If the message is empty or cannot be parsed

**Example:**
```javascript
const bundle = convertHL7ToFHIR(hl7Message);
console.log(`Created ${bundle.entry.length} resources`);
```

### `validateHL7Message(hl7Message)`

Validates that an HL7 message has the basic structure.

**Parameters:**
- `hl7Message` (string): The HL7 message string to validate

**Returns:**
- `boolean`: `true` if the message appears valid, `false` otherwise

**Example:**
```javascript
if (validateHL7Message(hl7Message)) {
  const bundle = convertHL7ToFHIR(hl7Message);
}
```

### `getSampleADTMessage()`

Returns a comprehensive sample ADT message for testing purposes.

**Returns:**
- `string`: A sample ADT^A01 message with multiple segments

**Example:**
```javascript
const sample = getSampleADTMessage();
const bundle = convertHL7ToFHIR(sample);
```

## Supported Message Types

- **ADT^A01** - Patient Admit
- **ADT^A08** - Patient Update
- **ADT^A04** - Patient Register
- **ADT^A03** - Patient Discharge
- **ADT^A11** - Cancel Admit
- **ORU^R01** - Observation Result
- **ORM^O01** - Order Message
- **Other message types** - Generic conversion based on segment types

## Resource Conversion Details

### MessageHeader (from MSH)
- Message type and event code
- Timestamp
- Source and destination information
- Message control ID
- Version information

### Patient (from PID)
- Identifiers (MRN, SSN, Driver's License, Account Number)
- Names (with components: family, given, middle, suffix, prefix)
- Demographics (gender, birth date, death date/indicator)
- Addresses (with proper use codes: home, work, etc.)
- Contact information (phone numbers)
- Race and ethnicity (US Core extensions)
- Marital status
- Primary language
- Communication preferences

### Encounter (from PV1)
- Encounter class (inpatient, outpatient, emergency, etc.)
- Status (in-progress, finished)
- Location references
- Period (admit/discharge dates)
- Participants (attending, referring, admitting doctors)
- Visit number identifier
- Financial class
- Discharge disposition
- Admission type

### RelatedPerson (from NK1)
- Name
- Relationship to patient
- Address
- Contact information (phone numbers)
- Dates

### Observation (from OBX)
- Observation code (LOINC, SNOMED, etc.)
- Value (numeric, string, coded, date/time)
- Units and reference ranges
- Interpretation (abnormal flags: L, H, LL, HH, N, A)
- Status (final, preliminary, corrected, etc.)
- Effective date/time
- Method
- Performer references

### AllergyIntolerance (from AL1)
- Allergen type (drug, food, medication, environment, etc.)
- Allergen code and description
- Severity (mild, moderate, severe)
- Reactions
- Identification date

### Condition (from DG1)
- Diagnosis code (ICD-10, SNOMED, etc.)
- Diagnosis description
- Onset date/time
- Diagnosis type (admitting, working, final, interim)
- Diagnosing clinician

### Procedure (from PR1)
- Procedure code (CPT, SNOMED, etc.)
- Procedure description
- Performed date/time
- Performer (surgeon, etc.)
- Procedure type

### Coverage (from IN1/IN2)
- Insurance company information
- Policy number
- Group number
- Subscriber information
- Coverage period (effective/expiration dates)
- Relationship to patient

## Terminology Systems

The converter maps HL7 codes to appropriate FHIR terminology systems:

- **LOINC** - Laboratory and clinical observations
- **SNOMED CT** - Clinical terminology
- **ICD-10** - Diagnoses
- **CPT** - Procedures
- **HL7 Code Systems** - Administrative codes (v2-0203, v3-RoleCode, etc.)
- **US Core Extensions** - Race, ethnicity, and other US-specific extensions

## Dependencies

This library requires the `hl7-parser` package for parsing HL7 messages:

```bash
npm install hl7-parser
```

The parser is used internally to parse HL7 messages before conversion. If you're using this library in a browser, you'll need to bundle both libraries together.

### Using with Local Parser

If you're using a local copy of the parser or the `hl7-parser` package isn't published yet, you can modify the import in `src/hl7ToFhirService.js`:

```javascript
// Change from:
import { parseHL7Message } from 'hl7-parser'

// To:
import { parseHL7Message } from './path/to/your/hl7ParserService.js'
// or
import { parseHL7Message } from '../hl7-parser/src/hl7ParserService.js'
```

## Browser Compatibility

This library uses modern JavaScript features:
- ES6 modules (import/export)
- Template literals
- Arrow functions
- Array methods (map, filter, forEach, find)

For older browsers, you may need to transpile the code using Babel or similar tools.

## Node.js Compatibility

- Node.js 12+ recommended
- Node.js 14+ for optimal performance

## Testing

The library includes a sample ADT message generator for testing:

```javascript
import { getSampleADTMessage, convertHL7ToFHIR } from 'hl7-to-fhir';

const sample = getSampleADTMessage();
const bundle = convertHL7ToFHIR(sample);

console.log('Bundle Type:', bundle.type);
console.log('Total Resources:', bundle.entry.length);
bundle.entry.forEach(entry => {
  console.log(`- ${entry.resource.resourceType}: ${entry.resource.id}`);
});
```

## Use Cases

- **HL7 to FHIR Migration**: Convert existing HL7 v2.x messages to FHIR format
- **Integration**: Bridge HL7 systems with FHIR-compliant systems
- **Data Transformation**: Transform HL7 messages for FHIR-based applications
- **Testing**: Generate FHIR test data from HL7 messages
- **Interoperability**: Enable communication between HL7 and FHIR systems
- **Analytics**: Convert HL7 data for FHIR-based analytics platforms

## Limitations and Considerations

1. **HL7 Version**: This converter is designed for HL7 v2.x messages. HL7 v3 (XML-based) is not supported.

2. **FHIR Version**: Output follows FHIR R4 specifications. For other FHIR versions, modifications may be needed.

3. **Custom Segments**: Custom or vendor-specific segments may not be fully converted. You may need to extend the conversion functions.

4. **Code System Mappings**: Some HL7 codes may not have direct FHIR equivalents. The converter uses best-effort mappings, but manual review may be needed.

5. **Resource References**: Resource IDs are auto-generated. In production, you may want to use proper UUIDs or maintain ID mappings.

6. **Validation**: The converter does not validate FHIR resources against profiles. Consider using a FHIR validator for production use.

7. **Incomplete Data**: If HL7 segments are missing required FHIR fields, those fields will be omitted. Some FHIR resources may be incomplete.

8. **Multiple Encounters**: The converter handles multiple PV1 segments by creating multiple Encounter resources.

9. **Practitioner Resources**: Practitioner resources are referenced but not fully created. You may need to create them separately.

10. **Organization/Location Resources**: Organization and Location resources are referenced but not fully created from facility data.

## Extending the Converter

To add support for additional segments or customize conversions:

1. Create a new conversion function following the pattern:
   ```javascript
   function convertXXXToFHIRResource(xxxSegment, patientId, encounterId) {
     const resource = {
       resourceType: 'YourResource',
       // ... mapping logic
     }
     return resource
   }
   ```

2. Add the conversion to the `convertHL7ToFHIR` function:
   ```javascript
   const xxxSegments = parsedMessage.segments.filter(s => s.segmentType === 'XXX')
   xxxSegments.forEach(xxxSegment => {
     if (xxxSegment.parsed) {
       const resource = convertXXXToFHIRResource(xxxSegment.parsed, patientId, encounterId)
       bundle.entry.push({
         fullUrl: `urn:uuid:${resource.id}`,
         resource: resource,
       })
     }
   })
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. When contributing:

1. Ensure your code follows the existing style
2. Add tests for new functionality
3. Update documentation as needed
4. Follow FHIR R4 specifications
5. Use appropriate terminology systems

## License

This project is provided as-is under the MIT License. See LICENSE file for details.

## Disclaimer

**IMPORTANT**: This software is provided for informational and development purposes. While it implements HL7 to FHIR conversion based on HL7 mapping guidelines, users are responsible for:

- Verifying that conversions meet their specific requirements
- Validating FHIR resources against appropriate profiles
- Testing thoroughly before production use
- Ensuring compliance with all applicable regulations and standards
- Reviewing terminology mappings for accuracy

The authors assume no liability for any misuse or errors in HL7 to FHIR conversion.

## Support

For issues, questions, or contributions, please open an issue on the GitHub repository.

## Related Projects

- [hl7-parser](https://github.com/yourusername/hl7-parser) - HL7 message parser (required dependency)
- [hl7-deidentification](https://github.com/yourusername/hl7-deidentification) - HL7 de-identification library

## Version History

- **1.0.0** - Initial release
  - Comprehensive HL7 to FHIR conversion
  - Support for all major HL7 segments
  - FHIR R4 compliance
  - US Core profile support
  - Proper terminology system mappings
  - Reference management between resources
  - Multiple resource type support
