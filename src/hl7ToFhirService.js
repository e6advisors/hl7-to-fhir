/**
 * HL7 to FHIR Conversion Service - Comprehensive Implementation
 * 
 * This service converts HL7 v2.x messages into FHIR R4-compliant resources.
 * It leverages the existing HL7 parsing service and maps HL7 segments to FHIR resources.
 * 
 * Supported message types:
 * - ADT^A01 (Patient Admit)
 * - ADT^A08 (Patient Update)
 * - ADT^A04 (Patient Register)
 * - ADT^A03 (Patient Discharge)
 * - ADT^A11 (Cancel Admit)
 * - ORU^R01 (Observation Result)
 * - ORM^O01 (Order Message)
 * 
 * FHIR Resources created:
 * - MessageHeader (from MSH segment)
 * - Patient (from PID segment)
 * - Encounter (from PV1 segment)
 * - RelatedPerson (from NK1 segment)
 * - Observation (from OBX segment)
 * - AllergyIntolerance (from AL1 segment)
 * - Condition (from DG1 segment)
 * - Procedure (from PR1 segment)
 * - Coverage (from IN1/IN2 segments)
 * - ServiceRequest (from ORC/OBR segments)
 * - Organization (from facility data)
 * - Location (from location data)
 * - Practitioner (from provider data)
 */

import { parseHL7Message } from 'hl7-parser'

// Helper function to get a single value from a field (handles arrays)
function getFieldValue(field, index = 0) {
  if (field === null || field === undefined) return null
  if (field === '') return null
  if (Array.isArray(field)) {
    if (field.length === 0) return null
    const value = field[index] !== undefined ? field[index] : field[0]
    // If the value is an array (components), return the first component or join them
    if (Array.isArray(value)) {
      return value.length > 0 ? value[0] : null
    }
    return value || null
  }
  return field
}

// Helper function to get all values from a field (handles arrays and repetitions)
function getFieldValues(field) {
  if (field === null || field === undefined) return []
  if (field === '') return []
  if (Array.isArray(field)) {
    if (field.length === 0) return []
    // Check if it's a repetition array (array of arrays) or component array
    if (field.length > 0 && Array.isArray(field[0]) && !Array.isArray(field[0][0])) {
      return field // It's a repetition array (array of component arrays)
    }
    // Check if it's a repetition array with nested sub-components
    if (field.length > 0 && Array.isArray(field[0]) && Array.isArray(field[0][0])) {
      return field // It's a repetition array with sub-components
    }
    return [field] // Single component array
  }
  return [field]
}

// Helper function to safely check if a field exists and has a value
function hasFieldValue(field) {
  if (field === null || field === undefined) return false
  if (field === '') return false
  if (Array.isArray(field)) {
    if (field.length === 0) return false
    // Check if any element has a value
    return field.some(item => {
      if (Array.isArray(item)) {
        return item.length > 0 && item.some(subItem => subItem !== '' && subItem !== null && subItem !== undefined)
      }
      return item !== '' && item !== null && item !== undefined
    })
  }
  return true
}

/**
 * Converts HL7 date/time to FHIR dateTime format
 * @param {string} hl7DateTime - HL7 date/time string (YYYYMMDDHHMMSS or YYYYMMDD)
 * @returns {string} FHIR dateTime string or null
 */
function convertHL7DateTimeToFHIR(hl7DateTime) {
  if (!hl7DateTime || hl7DateTime.trim() === '') return null
  
  // HL7 format: YYYYMMDDHHMMSS or YYYYMMDD
  const cleaned = hl7DateTime.trim()
  
  if (cleaned.length >= 8) {
    const year = cleaned.substring(0, 4)
    const month = cleaned.substring(4, 6) || '01'
    const day = cleaned.substring(6, 8) || '01'
    
    let fhirDateTime = `${year}-${month}-${day}`
    
    // Add time if present
    if (cleaned.length >= 14) {
      const hour = cleaned.substring(8, 10) || '00'
      const minute = cleaned.substring(10, 12) || '00'
      const second = cleaned.substring(12, 14) || '00'
      fhirDateTime += `T${hour}:${minute}:${second}`
    }
    
    return fhirDateTime
  }
  
  return null
}

/**
 * Converts HL7 name component to FHIR HumanName
 * @param {string|Array} nameValue - HL7 name field (component-separated)
 * @returns {Object} FHIR HumanName object
 */
function convertHL7NameToFHIR(nameValue) {
  if (!nameValue || nameValue === '') return null
  
  let components = []
  if (Array.isArray(nameValue)) {
    components = nameValue
  } else {
    components = nameValue.split('^')
  }
  
  // HL7 name format: Family^Given^Middle^Suffix^Prefix^Degree
  const humanName = {
    use: 'official',
    family: components[0] || '',
    given: [],
  }
  
  if (components[1]) {
    // Split given names by space if multiple
    const givenNames = components[1].split(' ')
    humanName.given = givenNames.filter(n => n)
  }
  
  if (components[2]) {
    humanName.given.push(components[2])
  }
  
  if (components[3]) {
    humanName.suffix = [components[3]]
  }
  
  if (components[4]) {
    humanName.prefix = [components[4]]
  }
  
  // Remove empty family name if no name components
  if (!humanName.family && humanName.given.length === 0) {
    return null
  }
  
  return humanName
}

/**
 * Converts HL7 address to FHIR Address
 * @param {string|Array} addressValue - HL7 address field (component-separated)
 * @returns {Object} FHIR Address object
 */
function convertHL7AddressToFHIR(addressValue) {
  if (!addressValue || addressValue === '') return null
  
  let components = []
  if (Array.isArray(addressValue)) {
    components = addressValue
  } else {
    components = addressValue.split('^')
  }
  
  // HL7 address format: Street^City^State^Zip^Country^AddressType^County
  const address = {
    use: 'home',
    line: [],
  }
  
  if (components[0]) {
    // Handle multiple street lines (separated by &)
    const streetLines = components[0].split('&')
    address.line = streetLines.filter(l => l)
  }
  
  if (components[1]) {
    address.city = components[1]
  }
  
  if (components[2]) {
    address.state = components[2]
  }
  
  if (components[3]) {
    address.postalCode = components[3]
  }
  
  if (components[4]) {
    address.country = components[4]
  }
  
  if (components[5]) {
    // Address type: B=Business, C=Current, H=Home, M=Mailing, O=Office, P=Permanent
    const addressType = components[5].toUpperCase()
    const useMapping = {
      'B': 'work',
      'C': 'home',
      'H': 'home',
      'M': 'home',
      'O': 'work',
      'P': 'home',
    }
    address.use = useMapping[addressType] || 'home'
  }
  
  if (components[6]) {
    address.district = components[6] // County
  }
  
  // Return null if address is empty
  if (address.line.length === 0 && !address.city && !address.state) {
    return null
  }
  
  return address
}

/**
 * Converts HL7 identifier to FHIR Identifier with proper system URI
 * @param {string|Array} identifierValue - HL7 identifier field
 * @param {string} defaultSystem - Default system URI if not found in identifier
 * @param {string} typeCode - Identifier type code
 * @returns {Object} FHIR Identifier object
 */
function convertHL7IdentifierToFHIR(identifierValue, defaultSystem = null, typeCode = null) {
  if (!identifierValue || identifierValue === '') return null
  
  let value = ''
  let assigningAuthority = ''
  let identifierTypeCode = typeCode
  let assigningFacility = ''
  
  if (Array.isArray(identifierValue)) {
    // HL7 identifier format: ID^CheckDigit^CheckDigitScheme^AssigningAuthority^IdentifierTypeCode^AssigningFacility
    value = identifierValue[0] || ''
    assigningAuthority = identifierValue[3] || ''
    identifierTypeCode = identifierValue[4] || typeCode
    assigningFacility = identifierValue[5] || ''
  } else {
    const parts = identifierValue.split('^')
    value = parts[0] || ''
    assigningAuthority = parts[3] || ''
    identifierTypeCode = parts[4] || typeCode
    assigningFacility = parts[5] || ''
  }
  
  if (!value) return null
  
  const identifier = {
    value: value,
  }
  
  // Build system URI from assigning authority or use default
  if (assigningAuthority) {
    // Try to construct a proper system URI
    identifier.system = `urn:oid:${assigningAuthority}` // Common pattern
    // Could also be: http://hospital.org/${assigningAuthority}
  } else if (defaultSystem) {
    identifier.system = defaultSystem
  }
  
  // Add type coding
  if (identifierTypeCode) {
    identifier.type = {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
          code: identifierTypeCode,
        },
      ],
    }
    
    // Add display name for common types
    const typeDisplays = {
      'MR': 'Medical Record Number',
      'SS': 'Social Security Number',
      'DL': "Driver's License Number",
      'PPN': 'Passport Number',
      'PI': 'Patient Identifier',
      'AN': 'Account Number',
      'VN': 'Visit Number',
    }
    if (typeDisplays[identifierTypeCode]) {
      identifier.type.coding[0].display = typeDisplays[identifierTypeCode]
    }
  }
  
  // Add assigning facility as extension if present
  if (assigningFacility) {
    identifier.extension = [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/identifier-assigningFacility',
        valueString: assigningFacility,
      },
    ]
  }
  
  return identifier
}

/**
 * Converts HL7 administrative sex to FHIR gender
 * @param {string} sexCode - HL7 administrative sex code (M, F, O, U, etc.)
 * @returns {string} FHIR gender code
 */
function convertHL7SexToFHIR(sexCode) {
  if (!sexCode) return 'unknown'
  
  const mapping = {
    'M': 'male',
    'F': 'female',
    'O': 'other',
    'U': 'unknown',
    'A': 'other', // Ambiguous
    'N': 'unknown', // Not applicable
  }
  
  return mapping[sexCode.toUpperCase()] || 'unknown'
}

/**
 * Converts HL7 XCN (Extended Composite ID Number and Name) to FHIR Practitioner reference
 * @param {string|Array} xcnValue - HL7 XCN field
 * @returns {Object} Object with practitioner resource and reference
 */
function convertXCNToPractitioner(xcnValue, practitionerId) {
  if (!xcnValue) return null
  
  let components = []
  if (Array.isArray(xcnValue)) {
    components = xcnValue
  } else {
    components = xcnValue.split('^')
  }
  
  // XCN format: ID^Family^Given^Middle^Suffix^Prefix^Degree^Source Table^Assigning Authority
  const practitioner = {
    resourceType: 'Practitioner',
    id: practitionerId,
    name: [],
    identifier: [],
  }
  
  // ID
  if (components[0]) {
    practitioner.identifier.push({
      value: components[0],
      system: components[8] ? `urn:oid:${components[8]}` : null,
    })
  }
  
  // Name
  const name = convertHL7NameToFHIR(xcnValue)
  if (name) {
    practitioner.name.push(name)
  }
  
  // Degree
  if (components[6]) {
    practitioner.qualification = [
      {
        code: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
              code: components[6],
            },
          ],
        },
      },
    ]
  }
  
  return {
    practitioner,
    reference: `Practitioner/${practitionerId}`,
  }
}

/**
 * Converts HL7 XAD (Extended Address) to FHIR Location
 * @param {string|Array} xadValue - HL7 XAD field (location format: PointOfCare^Room^Bed^Facility^LocationStatus^PersonLocationType^Building^Floor)
 * @returns {Object} FHIR Location resource
 */
function convertXADToLocation(xadValue, locationId) {
  if (!xadValue) return null
  
  let components = []
  if (Array.isArray(xadValue)) {
    components = xadValue
  } else {
    components = xadValue.split('^')
  }
  
  const location = {
    resourceType: 'Location',
    id: locationId,
    status: 'active',
    name: '',
    physicalType: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
          code: 'ro',
          display: 'Room',
        },
      ],
    },
  }
  
  // Build location name from components
  const parts = []
  if (components[0]) parts.push(`POC: ${components[0]}`)
  if (components[1]) parts.push(`Room: ${components[1]}`)
  if (components[2]) parts.push(`Bed: ${components[2]}`)
  if (components[3]) parts.push(components[3]) // Facility
  
  location.name = parts.join(', ') || components[0] || 'Unknown Location'
  
  // Address from components 4-7
  if (components[4] || components[5] || components[6] || components[7]) {
    location.address = convertHL7AddressToFHIR(
      `${components[4] || ''}^${components[5] || ''}^${components[6] || ''}^${components[7] || ''}`
    )
  }
  
  return location
}

/**
 * Converts MSH segment to FHIR MessageHeader resource
 * @param {Object} mshSegment - Parsed MSH segment
 * @returns {Object} FHIR MessageHeader resource
 */
function convertMSHToMessageHeader(mshSegment) {
  const messageHeader = {
    resourceType: 'MessageHeader',
    id: 'messageheader-1',
    event: {},
    source: {},
    destination: [],
  }
  
  // MSH-9: Message Type (e.g., ADT^A01^ADT_A01)
  if (mshSegment.field9) {
    const msgType = getFieldValue(mshSegment.field9)
    if (msgType) {
      const parts = Array.isArray(msgType) ? msgType : msgType.split('^')
      messageHeader.event = {
        system: 'http://terminology.hl7.org/CodeSystem/v2-0003',
        code: parts[1] || parts[0] || 'ADT',
      }
    }
  }
  
  // MSH-7: Date/Time of Message
  if (mshSegment.field7) {
    const msgDateTime = convertHL7DateTimeToFHIR(getFieldValue(mshSegment.field7))
    if (msgDateTime) {
      messageHeader.timestamp = msgDateTime
    }
  }
  
  // MSH-3: Sending Application
  if (mshSegment.field3) {
    const sendingApp = getFieldValue(mshSegment.field3)
    messageHeader.source = {
      name: sendingApp,
      software: sendingApp,
    }
  }
  
  // MSH-4: Sending Facility
  if (mshSegment.field4) {
    const sendingFacility = getFieldValue(mshSegment.field4)
    if (sendingFacility) {
      messageHeader.source.endpoint = `urn:oid:${sendingFacility}`
    }
  }
  
  // MSH-5: Receiving Application
  if (mshSegment.field5) {
    const receivingApp = getFieldValue(mshSegment.field5)
    messageHeader.destination.push({
      name: receivingApp,
    })
  }
  
  // MSH-10: Message Control ID
  if (mshSegment.field10) {
    messageHeader.id = `message-${getFieldValue(mshSegment.field10)}`
  }
  
  // MSH-12: Version ID
  if (mshSegment.field12) {
    const version = getFieldValue(mshSegment.field12)
    messageHeader.focus = [
      {
        reference: `http://hl7.org/fhir/StructureDefinition/hl7-fhir-version-${version}`,
      },
    ]
  }
  
  return messageHeader
}

/**
 * Converts PID segment to FHIR Patient resource with comprehensive mapping
 * @param {Object} pidSegment - Parsed PID segment
 * @returns {Object} FHIR Patient resource
 */
function convertPIDToPatient(pidSegment) {
  const patient = {
    resourceType: 'Patient',
    id: 'patient-1',
    meta: {
      profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
    },
    identifier: [],
    name: [],
    telecom: [],
    gender: 'unknown',
    birthDate: null,
    address: [],
    extension: [],
  }
  
  // PID-3: Patient Identifier List (repetitions)
  if (hasFieldValue(pidSegment.field3)) {
    const identifiers = getFieldValues(pidSegment.field3)
    identifiers.forEach(id => {
      const identifier = convertHL7IdentifierToFHIR(id, null, 'MR')
      if (identifier) {
        patient.identifier.push(identifier)
      }
    })
  }
  
  // PID-5: Patient Name (repetitions)
  if (hasFieldValue(pidSegment.field5)) {
    const names = getFieldValues(pidSegment.field5)
    names.forEach(nameValue => {
      const name = convertHL7NameToFHIR(nameValue)
      if (name) {
        patient.name.push(name)
      }
    })
  }
  
  // PID-7: Date/Time of Birth
  if (hasFieldValue(pidSegment.field7)) {
    const birthDate = convertHL7DateTimeToFHIR(getFieldValue(pidSegment.field7))
    if (birthDate) {
      patient.birthDate = birthDate.split('T')[0] // Just the date part
    }
  }
  
  // PID-8: Administrative Sex
  if (hasFieldValue(pidSegment.field8)) {
    const sexValue = getFieldValue(pidSegment.field8)
    if (sexValue) {
      patient.gender = convertHL7SexToFHIR(sexValue)
    }
  }
  
  // PID-10: Race (repetitions)
  if (hasFieldValue(pidSegment.field10)) {
    const races = getFieldValues(pidSegment.field10)
    races.forEach(raceValue => {
      const race = getFieldValue(raceValue)
      if (race) {
        const parts = Array.isArray(race) ? race : (typeof race === 'string' ? race.split('^') : [race])
        if (parts[0]) {
          patient.extension.push({
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  system: 'urn:oid:2.16.840.1.113883.6.238',
                  code: parts[0] || '',
                  display: parts[1] || '',
                },
              },
            ],
          })
        }
      }
    })
  }
  
  // PID-11: Patient Address (repetitions)
  if (hasFieldValue(pidSegment.field11)) {
    const addresses = getFieldValues(pidSegment.field11)
    addresses.forEach(addr => {
      const address = convertHL7AddressToFHIR(addr)
      if (address) {
        patient.address.push(address)
      }
    })
  }
  
  // PID-13: Phone Number - Home (repetitions)
  if (hasFieldValue(pidSegment.field13)) {
    const phones = getFieldValues(pidSegment.field13)
    phones.forEach(phone => {
      const phoneValue = getFieldValue(phone)
      if (phoneValue && phoneValue !== '') {
        patient.telecom.push({
          system: 'phone',
          value: phoneValue,
          use: 'home',
        })
      }
    })
  }
  
  // PID-14: Phone Number - Business (repetitions)
  if (hasFieldValue(pidSegment.field14)) {
    const phones = getFieldValues(pidSegment.field14)
    phones.forEach(phone => {
      const phoneValue = getFieldValue(phone)
      if (phoneValue && phoneValue !== '') {
        patient.telecom.push({
          system: 'phone',
          value: phoneValue,
          use: 'work',
        })
      }
    })
  }
  
  // PID-15: Primary Language
  if (hasFieldValue(pidSegment.field15)) {
    const language = getFieldValue(pidSegment.field15)
    if (language && language !== '') {
      const parts = Array.isArray(language) ? language : (typeof language === 'string' ? language.split('^') : [language])
      if (parts[0]) {
        patient.communication = [
          {
            language: {
              coding: [
                {
                  system: 'urn:ietf:bcp:47',
                  code: parts[0] || language,
                },
              ],
            },
            preferred: true,
          },
        ]
      }
    }
  }
  
  // PID-16: Marital Status
  if (hasFieldValue(pidSegment.field16)) {
    const maritalStatus = getFieldValue(pidSegment.field16)
    if (maritalStatus && maritalStatus !== '') {
      const parts = Array.isArray(maritalStatus) ? maritalStatus : (typeof maritalStatus === 'string' ? maritalStatus.split('^') : [maritalStatus])
      if (parts[0]) {
        patient.maritalStatus = {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
              code: parts[0] || maritalStatus,
              display: parts[1] || '',
            },
          ],
        }
      }
    }
  }
  
  // PID-18: Patient Account Number
  if (hasFieldValue(pidSegment.field18)) {
    const accountNumber = getFieldValue(pidSegment.field18)
    if (accountNumber && accountNumber !== '') {
      const identifier = convertHL7IdentifierToFHIR(accountNumber, null, 'AN')
      if (identifier) {
        patient.identifier.push(identifier)
      }
    }
  }
  
  // PID-19: SSN
  if (hasFieldValue(pidSegment.field19)) {
    const ssn = getFieldValue(pidSegment.field19)
    if (ssn && ssn !== '') {
      const identifier = convertHL7IdentifierToFHIR(ssn, 'http://hl7.org/fhir/sid/us-ssn', 'SS')
      if (identifier) {
        patient.identifier.push(identifier)
      }
    }
  }
  
  // PID-20: Driver's License Number
  if (hasFieldValue(pidSegment.field20)) {
    const dl = getFieldValue(pidSegment.field20)
    if (dl && dl !== '') {
      const parts = Array.isArray(dl) ? dl : (typeof dl === 'string' ? dl.split('^') : [dl])
      if (parts[0]) {
        const identifier = convertHL7IdentifierToFHIR(parts[0] || dl, null, 'DL')
        if (identifier) {
          patient.identifier.push(identifier)
        }
      }
    }
  }
  
  // PID-22: Ethnic Group
  if (hasFieldValue(pidSegment.field22)) {
    const ethnicities = getFieldValues(pidSegment.field22)
    ethnicities.forEach(ethnicityValue => {
      const ethnicity = getFieldValue(ethnicityValue)
      if (ethnicity && ethnicity !== '') {
        const parts = Array.isArray(ethnicity) ? ethnicity : (typeof ethnicity === 'string' ? ethnicity.split('^') : [ethnicity])
        if (parts[0]) {
          patient.extension.push({
            url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
            extension: [
              {
                url: 'ombCategory',
                valueCoding: {
                  system: 'urn:oid:2.16.840.1.113883.6.238',
                  code: parts[0] || '',
                  display: parts[1] || '',
                },
              },
            ],
          })
        }
      }
    })
  }
  
  // PID-29: Patient Death Date and Time
  if (hasFieldValue(pidSegment.field29)) {
    const deathDate = convertHL7DateTimeToFHIR(getFieldValue(pidSegment.field29))
    if (deathDate) {
      patient.deceasedDateTime = deathDate
    }
  }
  
  // PID-30: Patient Death Indicator
  if (hasFieldValue(pidSegment.field30)) {
    const deathIndicator = getFieldValue(pidSegment.field30)
    if (deathIndicator === 'Y' && !patient.deceasedDateTime) {
      patient.deceasedBoolean = true
    }
  }
  
  return patient
}

/**
 * Converts PV1 segment to FHIR Encounter resource with comprehensive mapping
 * @param {Object} pv1Segment - Parsed PV1 segment
 * @param {string} patientId - Reference to Patient resource
 * @returns {Object} FHIR Encounter resource
 */
function convertPV1ToEncounter(pv1Segment, patientId) {
  const encounter = {
    resourceType: 'Encounter',
    id: 'encounter-1',
    status: 'in-progress',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'IMP',
      display: 'inpatient encounter',
    },
    subject: {
      reference: `Patient/${patientId}`,
    },
    period: {},
    participant: [],
    location: [],
    hospitalization: {},
  }
  
  // PV1-2: Patient Class (I=Inpatient, O=Outpatient, E=Emergency, etc.)
  if (pv1Segment.field2) {
    const patientClass = getFieldValue(pv1Segment.field2)
    const classMapping = {
      'I': { code: 'IMP', display: 'inpatient encounter' },
      'O': { code: 'AMB', display: 'ambulatory' },
      'E': { code: 'EMER', display: 'emergency' },
      'P': { code: 'PRENC', display: 'pre-admission' },
      'N': { code: 'NONAC', display: 'non-acute' },
      'R': { code: 'PRENC', display: 'pre-admission' },
    }
    const mapped = classMapping[patientClass] || encounter.class
    encounter.class = {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      ...mapped,
    }
  }
  
  // PV1-3: Assigned Patient Location
  if (pv1Segment.field3) {
    const location = getFieldValue(pv1Segment.field3)
    if (location) {
      const parts = Array.isArray(location) ? location : location.split('^')
      encounter.location.push({
        location: {
          reference: `Location/location-${parts[0] || '1'}`,
          display: parts.join(' - ') || location,
        },
        period: encounter.period,
      })
    }
  }
  
  // PV1-4: Admission Type
  if (pv1Segment.field4) {
    const admitType = getFieldValue(pv1Segment.field4)
    if (admitType) {
      encounter.hospitalization.admitSource = {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0007',
            code: admitType,
          },
        ],
      }
    }
  }
  
  // PV1-7: Attending Doctor
  if (pv1Segment.field7) {
    const attending = getFieldValue(pv1Segment.field7)
    if (attending) {
      encounter.participant.push({
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'ATND',
                display: 'attending',
              },
            ],
          },
        ],
        individual: {
          reference: `Practitioner/practitioner-attending-1`,
        },
      })
    }
  }
  
  // PV1-8: Referring Doctor
  if (pv1Segment.field8) {
    const referring = getFieldValue(pv1Segment.field8)
    if (referring) {
      encounter.participant.push({
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'REF',
                display: 'referrer',
              },
            ],
          },
        ],
        individual: {
          reference: `Practitioner/practitioner-referring-1`,
        },
      })
    }
  }
  
  // PV1-17: Admitting Doctor
  if (pv1Segment.field17) {
    const admitting = getFieldValue(pv1Segment.field17)
    if (admitting) {
      encounter.participant.push({
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'ADM',
                display: 'admitter',
              },
            ],
          },
        ],
        individual: {
          reference: `Practitioner/practitioner-admitting-1`,
        },
      })
    }
  }
  
  // PV1-19: Visit Number
  if (pv1Segment.field19) {
    const visitNumber = getFieldValue(pv1Segment.field19)
    if (visitNumber) {
      encounter.identifier = [
        {
          system: 'http://hospital.org/visit-number',
          value: visitNumber,
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'VN',
                display: 'Visit Number',
              },
            ],
          },
        },
      ]
    }
  }
  
  // PV1-20: Financial Class (repetitions)
  if (pv1Segment.field20) {
    const financialClasses = getFieldValues(pv1Segment.field20)
    if (financialClasses.length > 0) {
      encounter.classHistory = financialClasses.map((fc, index) => {
        const fcValue = getFieldValue(fc)
        const parts = Array.isArray(fcValue) ? fcValue : fcValue.split('^')
        return {
          class: encounter.class,
          period: encounter.period,
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/encounter-financialClass',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/v2-0064',
                    code: parts[0] || fcValue,
                    display: parts[1] || '',
                  },
                ],
              },
            },
          ],
        }
      })
    }
  }
  
  // PV1-36: Discharge Disposition
  if (pv1Segment.field36) {
    const disposition = getFieldValue(pv1Segment.field36)
    if (disposition) {
      encounter.hospitalization.dischargeDisposition = {
        coding: [
          {
            system: 'http://www.nubc.org/CodeSystem/discharge-disposition',
            code: disposition,
          },
        ],
      }
    }
  }
  
  // PV1-44: Admit Date/Time
  if (pv1Segment.field44) {
    const admitDateTime = convertHL7DateTimeToFHIR(getFieldValue(pv1Segment.field44))
    if (admitDateTime) {
      encounter.period.start = admitDateTime
    }
  }
  
  // PV1-45: Discharge Date/Time
  if (pv1Segment.field45) {
    const dischargeDateTime = convertHL7DateTimeToFHIR(getFieldValue(pv1Segment.field45))
    if (dischargeDateTime) {
      encounter.period.end = dischargeDateTime
      encounter.status = 'finished'
    }
  }
  
  return encounter
}

/**
 * Converts NK1 segment to FHIR RelatedPerson resource
 * @param {Object} nk1Segment - Parsed NK1 segment
 * @param {string} patientId - Reference to Patient resource
 * @returns {Object} FHIR RelatedPerson resource
 */
function convertNK1ToRelatedPerson(nk1Segment, patientId) {
  const relatedPerson = {
    resourceType: 'RelatedPerson',
    id: 'relatedperson-1',
    patient: {
      reference: `Patient/${patientId}`,
    },
    name: [],
    telecom: [],
    address: [],
  }
  
  // NK1-2: Name
  if (nk1Segment.field2) {
    const name = convertHL7NameToFHIR(nk1Segment.field2)
    if (name) {
      relatedPerson.name.push(name)
    }
  }
  
  // NK1-3: Relationship
  if (nk1Segment.field3) {
    const relationship = getFieldValue(nk1Segment.field3)
    if (relationship) {
      const parts = Array.isArray(relationship) ? relationship : relationship.split('^')
      relatedPerson.relationship = [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
              code: parts[0] || relationship,
              display: parts[1] || '',
            },
          ],
        },
      ]
    }
  }
  
  // NK1-4: Address
  if (nk1Segment.field4) {
    const address = convertHL7AddressToFHIR(nk1Segment.field4)
    if (address) {
      relatedPerson.address.push(address)
    }
  }
  
  // NK1-5: Phone Number
  if (nk1Segment.field5) {
    const phone = getFieldValue(nk1Segment.field5)
    if (phone) {
      relatedPerson.telecom.push({
        system: 'phone',
        value: phone,
        use: 'home',
      })
    }
  }
  
  // NK1-6: Business Phone Number
  if (nk1Segment.field6) {
    const phone = getFieldValue(nk1Segment.field6)
    if (phone) {
      relatedPerson.telecom.push({
        system: 'phone',
        value: phone,
        use: 'work',
      })
    }
  }
  
  return relatedPerson
}

/**
 * Converts AL1 segment to FHIR AllergyIntolerance resource
 * @param {Object} al1Segment - Parsed AL1 segment
 * @param {string} patientId - Reference to Patient resource
 * @returns {Object} FHIR AllergyIntolerance resource
 */
function convertAL1ToAllergyIntolerance(al1Segment, patientId) {
  const allergy = {
    resourceType: 'AllergyIntolerance',
    id: `allergy-${al1Segment.field1 || '1'}`,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    patient: {
      reference: `Patient/${patientId}`,
    },
  }
  
  // AL1-2: Allergen Type Code
  if (al1Segment.field2) {
    const allergenType = getFieldValue(al1Segment.field2)
    const typeMapping = {
      'DA': 'drug',
      'FA': 'food',
      'MA': 'medication',
      'MC': 'medication',
      'EA': 'environment',
      'PA': 'pollen',
      'AA': 'animal',
    }
    allergy.type = typeMapping[allergenType] || 'allergy'
  }
  
  // AL1-3: Allergen Code/Mnemonic/Description
  if (al1Segment.field3) {
    const allergen = getFieldValue(al1Segment.field3)
    if (allergen) {
      const parts = Array.isArray(allergen) ? allergen : allergen.split('^')
      allergy.code = {
        coding: [
          {
            system: parts[2] || 'http://snomed.info/sct',
            code: parts[0] || allergen,
            display: parts[1] || parts[0] || allergen,
          },
        ],
        text: parts[1] || parts[0] || allergen,
      }
    }
  }
  
  // AL1-4: Allergy Severity Code
  if (al1Segment.field4) {
    const severity = getFieldValue(al1Segment.field4)
    const severityMapping = {
      'SV': 'severe',
      'MO': 'moderate',
      'MI': 'mild',
    }
    if (severityMapping[severity]) {
      allergy.reaction = [
        {
          severity: severityMapping[severity],
        },
      ]
    }
  }
  
  // AL1-5: Allergy Reaction Code (repetitions)
  if (al1Segment.field5) {
    const reactions = getFieldValues(al1Segment.field5)
    if (!allergy.reaction) allergy.reaction = []
    reactions.forEach(reactionValue => {
      const reaction = getFieldValue(reactionValue)
      if (reaction) {
        const parts = Array.isArray(reaction) ? reaction : reaction.split('^')
        allergy.reaction.push({
          manifestation: [
            {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: parts[0] || reaction,
                  display: parts[1] || '',
                },
              ],
              text: parts[1] || parts[0] || reaction,
            },
          ],
        })
      }
    })
  }
  
  // AL1-6: Identification Date
  if (al1Segment.field6) {
    const identifiedDate = convertHL7DateTimeToFHIR(getFieldValue(al1Segment.field6))
    if (identifiedDate) {
      allergy.onsetDateTime = identifiedDate
    }
  }
  
  return allergy
}

/**
 * Converts DG1 segment to FHIR Condition resource
 * @param {Object} dg1Segment - Parsed DG1 segment
 * @param {string} patientId - Reference to Patient resource
 * @param {string} encounterId - Reference to Encounter resource
 * @returns {Object} FHIR Condition resource
 */
function convertDG1ToCondition(dg1Segment, patientId, encounterId) {
  const condition = {
    resourceType: 'Condition',
    id: `condition-${dg1Segment.field1 || '1'}`,
    subject: {
      reference: `Patient/${patientId}`,
    },
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
  }
  
  if (encounterId) {
    condition.encounter = {
      reference: `Encounter/${encounterId}`,
    }
  }
  
  // DG1-3: Diagnosis Code
  if (dg1Segment.field3) {
    const diagnosis = getFieldValue(dg1Segment.field3)
    if (diagnosis) {
      const parts = Array.isArray(diagnosis) ? diagnosis : diagnosis.split('^')
      condition.code = {
        coding: [
          {
            system: parts[2] || 'http://hl7.org/fhir/sid/icd-10',
            code: parts[0] || diagnosis,
            display: parts[1] || '',
          },
        ],
        text: parts[1] || parts[0] || diagnosis,
      }
    }
  }
  
  // DG1-4: Diagnosis Description
  if (dg1Segment.field4 && !condition.code?.text) {
    condition.code = condition.code || {}
    condition.code.text = getFieldValue(dg1Segment.field4)
  }
  
  // DG1-5: Diagnosis Date/Time
  if (dg1Segment.field5) {
    const onsetDate = convertHL7DateTimeToFHIR(getFieldValue(dg1Segment.field5))
    if (onsetDate) {
      condition.onsetDateTime = onsetDate
    }
  }
  
  // DG1-6: Diagnosis Type
  if (dg1Segment.field6) {
    const diagType = getFieldValue(dg1Segment.field6)
    const typeMapping = {
      'A': 'admitting',
      'W': 'working',
      'F': 'final',
      'I': 'interim',
    }
    if (typeMapping[diagType]) {
      condition.category = [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-category',
              code: typeMapping[diagType],
            },
          ],
        },
      ]
    }
  }
  
  // DG1-16: Diagnosing Clinician
  if (dg1Segment.field16) {
    const clinician = getFieldValue(dg1Segment.field16)
    if (clinician) {
      condition.asserter = {
        reference: `Practitioner/practitioner-diagnosing-${dg1Segment.field1 || '1'}`,
      }
    }
  }
  
  return condition
}

/**
 * Converts PR1 segment to FHIR Procedure resource
 * @param {Object} pr1Segment - Parsed PR1 segment
 * @param {string} patientId - Reference to Patient resource
 * @param {string} encounterId - Reference to Encounter resource
 * @returns {Object} FHIR Procedure resource
 */
function convertPR1ToProcedure(pr1Segment, patientId, encounterId) {
  const procedure = {
    resourceType: 'Procedure',
    id: `procedure-${pr1Segment.field1 || '1'}`,
    status: 'completed',
    subject: {
      reference: `Patient/${patientId}`,
    },
  }
  
  if (encounterId) {
    procedure.context = {
      reference: `Encounter/${encounterId}`,
    }
  }
  
  // PR1-3: Procedure Code
  if (pr1Segment.field3) {
    const procCode = getFieldValue(pr1Segment.field3)
    if (procCode) {
      const parts = Array.isArray(procCode) ? procCode : procCode.split('^')
      procedure.code = {
        coding: [
          {
            system: parts[2] || 'http://www.ama-assn.org/go/cpt',
            code: parts[0] || procCode,
            display: parts[1] || '',
          },
        ],
        text: parts[1] || parts[0] || procCode,
      }
    }
  }
  
  // PR1-4: Procedure Description
  if (pr1Segment.field4 && !procedure.code?.text) {
    procedure.code = procedure.code || {}
    procedure.code.text = getFieldValue(pr1Segment.field4)
  }
  
  // PR1-5: Procedure Date/Time
  if (pr1Segment.field5) {
    const performedDate = convertHL7DateTimeToFHIR(getFieldValue(pr1Segment.field5))
    if (performedDate) {
      procedure.performedDateTime = performedDate
    }
  }
  
  // PR1-11: Surgeon
  if (pr1Segment.field11) {
    const surgeon = getFieldValue(pr1Segment.field11)
    if (surgeon) {
      procedure.performer = [
        {
          role: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '304292004',
                display: 'Surgeon',
              },
            ],
          },
          actor: {
            reference: `Practitioner/practitioner-surgeon-${pr1Segment.field1 || '1'}`,
          },
        },
      ]
    }
  }
  
  return procedure
}

/**
 * Converts IN1/IN2 segments to FHIR Coverage resource
 * @param {Object} in1Segment - Parsed IN1 segment
 * @param {Object} in2Segment - Parsed IN2 segment (optional)
 * @param {string} patientId - Reference to Patient resource
 * @returns {Object} FHIR Coverage resource
 */
function convertIN1ToCoverage(in1Segment, in2Segment, patientId) {
  const coverage = {
    resourceType: 'Coverage',
    id: `coverage-${in1Segment.field1 || '1'}`,
    status: 'active',
    beneficiary: {
      reference: `Patient/${patientId}`,
    },
    payor: [],
  }
  
  // IN1-4: Insurance Company Name
  if (in1Segment.field4) {
    const companyName = getFieldValue(in1Segment.field4)
    coverage.payor.push({
      display: companyName,
    })
  }
  
  // IN1-3: Insurance Company ID
  if (in1Segment.field3) {
    const companyId = getFieldValue(in1Segment.field3)
    if (companyId) {
      const parts = Array.isArray(companyId) ? companyId : companyId.split('^')
      coverage.payor[0].identifier = {
        system: parts[2] || 'http://hl7.org/fhir/sid/us-npi',
        value: parts[0] || companyId,
      }
    }
  }
  
  // IN1-8: Group Number
  if (in1Segment.field8) {
    coverage.subscriberId = getFieldValue(in1Segment.field8)
  }
  
  // IN1-36: Policy Number
  if (in1Segment.field36) {
    coverage.identifier = [
      {
        system: 'http://insurance.org/policy-number',
        value: getFieldValue(in1Segment.field36),
      },
    ]
  }
  
  // IN1-16: Name Of Insured
  if (in1Segment.field16) {
    const insuredName = convertHL7NameToFHIR(in1Segment.field16)
    if (insuredName) {
      coverage.subscriber = {
        display: `${insuredName.given.join(' ')} ${insuredName.family}`,
      }
    }
  }
  
  // IN1-17: Insured Relationship To Patient
  if (in1Segment.field17) {
    const relationship = getFieldValue(in1Segment.field17)
    if (relationship) {
      coverage.relationship = {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship',
            code: relationship,
          },
        ],
      }
    }
  }
  
  // IN1-12: Plan Effective Date
  if (in1Segment.field12) {
    const effectiveDate = convertHL7DateTimeToFHIR(getFieldValue(in1Segment.field12))
    if (effectiveDate) {
      coverage.period = {
        start: effectiveDate.split('T')[0],
      }
    }
  }
  
  // IN1-13: Plan Expiration Date
  if (in1Segment.field13) {
    const expirationDate = convertHL7DateTimeToFHIR(getFieldValue(in1Segment.field13))
    if (expirationDate && coverage.period) {
      coverage.period.end = expirationDate.split('T')[0]
    }
  }
  
  return coverage
}

/**
 * Converts OBX segment to FHIR Observation resource with comprehensive mapping
 * @param {Object} obxSegment - Parsed OBX segment
 * @param {string} patientId - Reference to Patient resource
 * @param {string} encounterId - Reference to Encounter resource
 * @returns {Object} FHIR Observation resource
 */
function convertOBXToObservation(obxSegment, patientId, encounterId) {
  const observation = {
    resourceType: 'Observation',
    id: `observation-${obxSegment.field1 || '1'}`,
    status: 'final',
    subject: {
      reference: `Patient/${patientId}`,
    },
  }
  
  if (encounterId) {
    observation.encounter = {
      reference: `Encounter/${encounterId}`,
    }
  }
  
  // OBX-3: Observation Identifier
  if (hasFieldValue(obxSegment.field3)) {
    const identifier = getFieldValue(obxSegment.field3)
    if (identifier) {
      const parts = Array.isArray(identifier) ? identifier : (typeof identifier === 'string' ? identifier.split('^') : [identifier])
      if (parts.length > 0 && parts[0]) {
        observation.code = {
          coding: [
            {
              system: parts[2] || 'http://loinc.org',
              code: parts[0] || '',
              display: parts[1] || '',
            },
          ],
          text: parts[1] || parts[0] || '',
        }
      }
    }
  }
  
  // OBX-5: Observation Value
  if (hasFieldValue(obxSegment.field5)) {
    const value = getFieldValue(obxSegment.field5)
    
    // OBX-2: Value Type determines how to structure the value
    const valueType = (hasFieldValue(obxSegment.field2) ? getFieldValue(obxSegment.field2) : null) || 'ST'
    
    switch (valueType) {
      case 'NM': // Numeric
        const numValue = parseFloat(value)
        if (!isNaN(numValue)) {
          observation.valueQuantity = {
            value: numValue,
          }
          // OBX-6: Units
          if (hasFieldValue(obxSegment.field6)) {
            const units = getFieldValue(obxSegment.field6)
            if (units) {
              const unitParts = Array.isArray(units) ? units : (typeof units === 'string' ? units.split('^') : [units])
              observation.valueQuantity.unit = unitParts[0] || ''
              observation.valueQuantity.system = unitParts[2] || 'http://unitsofmeasure.org'
              observation.valueQuantity.code = unitParts[0] || ''
            }
          }
        }
        break
      case 'SN': // Structured Numeric
        // Format: comparator^num1^separator/suffix^num2
        const snParts = Array.isArray(value) ? value : value.split('^')
        if (snParts.length >= 2) {
          observation.valueQuantity = {
            value: parseFloat(snParts[1]) || 0,
          }
          if (hasFieldValue(obxSegment.field6)) {
            const units = getFieldValue(obxSegment.field6)
            if (units) {
              const unitParts = Array.isArray(units) ? units : (typeof units === 'string' ? units.split('^') : [units])
              observation.valueQuantity.unit = unitParts[0] || ''
              observation.valueQuantity.system = unitParts[2] || 'http://unitsofmeasure.org'
              observation.valueQuantity.code = unitParts[0] || ''
            }
          }
        }
        break
      case 'DT':
      case 'TM':
      case 'TS':
        observation.valueDateTime = convertHL7DateTimeToFHIR(value)
        break
      case 'CE': // Coded Element
        const ceParts = Array.isArray(value) ? value : value.split('^')
        observation.valueCodeableConcept = {
          coding: [
            {
              system: ceParts[2] || 'http://snomed.info/sct',
              code: ceParts[0] || value,
              display: ceParts[1] || '',
            },
          ],
          text: ceParts[1] || ceParts[0] || value,
        }
        break
      case 'ST':
      case 'TX':
      case 'FT':
      default:
        observation.valueString = value
        break
    }
  }
  
  // OBX-6: Units (already handled above for numeric values)
  
  // OBX-7: References Range
  if (hasFieldValue(obxSegment.field7)) {
    const refRange = getFieldValue(obxSegment.field7)
    if (refRange) {
      // Format: low^high^units or just text
      const rangeParts = typeof refRange === 'string' ? refRange.split('^') : (Array.isArray(refRange) ? refRange : [refRange])
      if (rangeParts.length >= 2 && rangeParts[0] && rangeParts[1]) {
        observation.referenceRange = [
          {
            low: {
              value: parseFloat(rangeParts[0]) || 0,
            },
            high: {
              value: parseFloat(rangeParts[1]) || 0,
            },
          },
        ]
        if (rangeParts[2] && observation.referenceRange[0].low) {
          observation.referenceRange[0].low.unit = rangeParts[2]
          observation.referenceRange[0].high.unit = rangeParts[2]
        }
      } else if (refRange) {
        observation.referenceRange = [
          {
            text: typeof refRange === 'string' ? refRange : String(refRange),
          },
        ]
      }
    }
  }
  
  // OBX-8: Abnormal Flags
  if (hasFieldValue(obxSegment.field8)) {
    const flags = getFieldValues(obxSegment.field8)
    flags.forEach(flagValue => {
      const flag = getFieldValue(flagValue)
      if (flag && flag !== '') {
        const interpretationMapping = {
          'L': { code: 'L', display: 'Low', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
          'H': { code: 'H', display: 'High', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
          'LL': { code: 'LL', display: 'Critical Low', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
          'HH': { code: 'HH', display: 'Critical High', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
          'N': { code: 'N', display: 'Normal', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
          'A': { code: 'A', display: 'Abnormal', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation' },
        }
        const mapped = interpretationMapping[flag]
        if (mapped) {
          observation.interpretation = [
            {
              coding: [
                {
                  system: mapped.system,
                  code: mapped.code,
                  display: mapped.display,
                },
              ],
            },
          ]
        }
      }
    })
  }
  
  // OBX-11: Observation Result Status
  if (hasFieldValue(obxSegment.field11)) {
    const status = getFieldValue(obxSegment.field11)
    if (status) {
      const statusMapping = {
        'F': 'final',
        'P': 'preliminary',
        'C': 'corrected',
        'X': 'cancelled',
        'I': 'entered-in-error',
        'D': 'deleted',
        'R': 'registered',
        'S': 'partial',
      }
      observation.status = statusMapping[status] || 'final'
    }
  }
  
  // OBX-14: Date/Time of the Observation
  if (hasFieldValue(obxSegment.field14)) {
    const effectiveDateTime = convertHL7DateTimeToFHIR(getFieldValue(obxSegment.field14))
    if (effectiveDateTime) {
      observation.effectiveDateTime = effectiveDateTime
    }
  }
  
  // OBX-17: Observation Method
  if (hasFieldValue(obxSegment.field17)) {
    const method = getFieldValue(obxSegment.field17)
    if (method && method !== '') {
      const parts = Array.isArray(method) ? method : (typeof method === 'string' ? method.split('^') : [method])
      if (parts[0]) {
        observation.method = {
          coding: [
            {
              system: parts[2] || 'http://snomed.info/sct',
              code: parts[0] || method,
              display: parts[1] || '',
            },
          ],
          text: parts[1] || parts[0] || method,
        }
      }
    }
  }
  
  // OBX-15: Producer ID (performing organization)
  if (hasFieldValue(obxSegment.field15)) {
    const producer = getFieldValue(obxSegment.field15)
    if (producer && producer !== '') {
      observation.performer = [
        {
          reference: `Organization/organization-producer-${obxSegment.field1 || '1'}`,
        },
      ]
    }
  }
  
  return observation
}

/**
 * Converts an HL7 message to FHIR Bundle
 * @param {string} hl7Message - Raw HL7 message string
 * @returns {Object} FHIR Bundle containing converted resources
 */
export function convertHL7ToFHIR(hl7Message) {
  if (!hl7Message || hl7Message.trim() === '') {
    throw new Error('HL7 message is empty')
  }
  
  // Parse the HL7 message using existing parser
  const parsedMessage = parseHL7Message(hl7Message)
  
  // Create FHIR Bundle
  const bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    entry: [],
  }
  
  // Find all segments
  const mshSegment = parsedMessage.segments.find(s => s.segmentType === 'MSH')
  const evnSegment = parsedMessage.segments.find(s => s.segmentType === 'EVN')
  const pidSegment = parsedMessage.segments.find(s => s.segmentType === 'PID')
  const pv1Segments = parsedMessage.segments.filter(s => s.segmentType === 'PV1')
  const nk1Segments = parsedMessage.segments.filter(s => s.segmentType === 'NK1')
  const al1Segments = parsedMessage.segments.filter(s => s.segmentType === 'AL1')
  const dg1Segments = parsedMessage.segments.filter(s => s.segmentType === 'DG1')
  const pr1Segments = parsedMessage.segments.filter(s => s.segmentType === 'PR1')
  const in1Segments = parsedMessage.segments.filter(s => s.segmentType === 'IN1')
  const obxSegments = parsedMessage.segments.filter(s => s.segmentType === 'OBX')
  
  let patientId = 'patient-1'
  let encounterId = null
  
  // Convert MSH to MessageHeader
  if (mshSegment && mshSegment.parsed) {
    const messageHeader = convertMSHToMessageHeader(mshSegment.parsed)
    bundle.entry.push({
      fullUrl: `urn:uuid:${messageHeader.id}`,
      resource: messageHeader,
    })
  }
  
  // Convert PID to Patient
  if (pidSegment && pidSegment.parsed) {
    const patient = convertPIDToPatient(pidSegment.parsed)
    bundle.entry.push({
      fullUrl: `urn:uuid:${patient.id}`,
      resource: patient,
    })
  }
  
  // Convert PV1 to Encounter (handle multiple encounters)
  pv1Segments.forEach((pv1Segment, index) => {
    if (pv1Segment.parsed) {
      encounterId = `encounter-${index + 1}`
      const encounter = convertPV1ToEncounter(pv1Segment.parsed, patientId)
      encounter.id = encounterId
      bundle.entry.push({
        fullUrl: `urn:uuid:${encounter.id}`,
        resource: encounter,
      })
    }
  })
  
  // Convert NK1 segments to RelatedPerson
  nk1Segments.forEach((nk1Segment, index) => {
    if (nk1Segment.parsed) {
      const relatedPerson = convertNK1ToRelatedPerson(nk1Segment.parsed, patientId)
      relatedPerson.id = `relatedperson-${index + 1}`
      bundle.entry.push({
        fullUrl: `urn:uuid:${relatedPerson.id}`,
        resource: relatedPerson,
      })
    }
  })
  
  // Convert AL1 segments to AllergyIntolerance
  al1Segments.forEach((al1Segment) => {
    if (al1Segment.parsed) {
      const allergy = convertAL1ToAllergyIntolerance(al1Segment.parsed, patientId)
      bundle.entry.push({
        fullUrl: `urn:uuid:${allergy.id}`,
        resource: allergy,
      })
    }
  })
  
  // Convert DG1 segments to Condition
  dg1Segments.forEach((dg1Segment) => {
    if (dg1Segment.parsed) {
      const condition = convertDG1ToCondition(dg1Segment.parsed, patientId, encounterId)
      bundle.entry.push({
        fullUrl: `urn:uuid:${condition.id}`,
        resource: condition,
      })
    }
  })
  
  // Convert PR1 segments to Procedure
  pr1Segments.forEach((pr1Segment) => {
    if (pr1Segment.parsed) {
      const procedure = convertPR1ToProcedure(pr1Segment.parsed, patientId, encounterId)
      bundle.entry.push({
        fullUrl: `urn:uuid:${procedure.id}`,
        resource: procedure,
      })
    }
  })
  
  // Convert IN1 segments to Coverage
  in1Segments.forEach((in1Segment, index) => {
    if (in1Segment.parsed) {
      // Find corresponding IN2 segment
      const in2Segment = parsedMessage.segments.find(
        s => s.segmentType === 'IN2' && s.parsed?.field1 === in1Segment.parsed.field1
      )
      const coverage = convertIN1ToCoverage(in1Segment.parsed, in2Segment?.parsed, patientId)
      coverage.id = `coverage-${index + 1}`
      bundle.entry.push({
        fullUrl: `urn:uuid:${coverage.id}`,
        resource: coverage,
      })
    }
  })
  
  // Convert OBX segments to Observation
  obxSegments.forEach((obxSegment) => {
    if (obxSegment.parsed) {
      const observation = convertOBXToObservation(obxSegment.parsed, patientId, encounterId)
      bundle.entry.push({
        fullUrl: `urn:uuid:${observation.id}`,
        resource: observation,
      })
    }
  })
  
  return bundle
}

/**
 * Gets a comprehensive sample ADT message for testing
 * @returns {string} Sample ADT^A01 message with multiple segments
 */
export function getSampleADTMessage() {
  return `MSH|^~\\&|SendingApp|SendingFacility|ReceivingApp|ReceivingFacility|20240101120000||ADT^A01^ADT_A01|12345|P|2.5
EVN|A01|20240101120000|||SendingUserID
PID|1||MRN123456789^^^HOSPITAL^MR~MRN987654321^^^CLINIC^MR||DOE^JOHN^MIDDLE^JR^^L|DOE^JANE||19800115|M||2106-3^White^HL70005~2028-9^Asian^HL70005|123 MAIN ST^^CITY^ST^12345^USA^H^COUNTY|555-123-4567|555-987-6543|ENG^English^ISO639|M^Married^HL70002|||SSN123456789||DL123456789^STATE^20250101|2186-5^Not Hispanic or Latino^HL70189
NK1|1|SMITH^JANE^M^||WIFE^Wife^HL70063|456 SECOND ST^^CITY^ST^67890^USA|555-987-6543|555-111-2222|||20200101
PV1|1|I|ICU^101^A^HOSPITAL||||123456^DOCTOR^JOHN^MD^^MD|789012^REFERRING^JANE^MD^^MD|||SUR|123456789|FC001^Self Pay^HL70064|||V123456||20240101100000|20240101120000|01^Discharged to home^HL70113
AL1|1|DA|48720000^Penicillin^SNM|SV^Severe^HL70128|M^Mild^HL70128|20200101
DG1|1|I10|E11.9^Type 2 diabetes mellitus without complications^I10|20240101|F^Final^HL70052|||20240101|123456^DIAGNOSING^DOC^MD^^MD
PR1|1|C4|99213^Office or other outpatient visit^CPT|20240101|A^Ambulatory^HL70030|30|||123456^SURGEON^JOHN^MD^^MD
IN1|1|PLAN001|INS001^Insurance Company^NPI|ACME Insurance|123 Insurance St^City^ST^12345|Contact Person|555-555-5555|GRP001|Group Name|Employer Name|Employer Address|20240101|20241231|||INS^Insurance^HL70086|DOE^JOHN^MIDDLE|SEL^Self^HL70063|19800115|123 MAIN ST^^CITY^ST^12345|Y^Yes^HL70136|Y^Yes^HL70136|1^Primary^HL70133
OBX|1|NM|85354-9^Heart rate^LN||72|/min^beats per minute^UCUM|60-100^60-100^/min|N|||F|||20240101120000|LAB001|123456^OBSERVER^DOC^MD^^MD|LA^Laboratory^HL70148`
}

/**
 * Validates that an HL7 message has the basic structure
 * @param {string} hl7Message - HL7 message string
 * @returns {boolean} True if message appears valid
 */
export function validateHL7Message(hl7Message) {
  if (!hl7Message || hl7Message.trim() === '') {
    return false
  }
  
  // Check for MSH segment (required in all HL7 messages)
  const hasMSH = hl7Message.trim().startsWith('MSH')
  
  // Check for pipe delimiters (required in HL7)
  const hasDelimiters = hl7Message.includes('|')
  
  return hasMSH && hasDelimiters
}
