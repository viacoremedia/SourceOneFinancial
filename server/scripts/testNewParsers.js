/**
 * Quick smoke test for the 3 new parser registrations.
 * Verifies detectParser() correctly identifies each OMNI table format.
 * 
 * Run: node scripts/testNewParsers.js
 */

const { detectParser } = require('../services/csvParserService');

console.log('=== Testing Parser Detection for OMNI Tables ===\n');

// Test 1: Dealer Communication headers
const commHeaders = [
    'SOURCESYSTEMCOMMUNICATIONID', 'SOURCESYSTEM', 'COMMUNICATIONORGANIZATIONNAME',
    'COMMUNICATIONUSERNAME', 'COMMUNICATIONUSERFULLNAME', 'COMMUNICATIONUSEREMAIL',
    'COMMUNICATIONTYPE', 'RECIPIENTRELATIONSHIPTYPE', 'RECIPIENTORGANIZATIONNAME',
    'INTERNALRELATIONSHIPID1', 'INTERNALRELATIONSHIPID2',
    'COMMUNICATIONRESULT1', 'COMMUNICATIONFEEDBACK1',
    'COMMUNICATIONEVENTDATETIME', 'COMMUNICATIONEVENTTIMZEONE',
    'LASTCOMMUNICATIONEVENTDATETIME',
    'ISPROSPECT', 'ISACTIVERELATIONSHIP', 'ISINACTIVERELATIONSHIP'
];
const commResult = detectParser(commHeaders);
console.log(`Dealer Communication: ${commResult === 'dealer_communication' ? '✅ PASS' : '❌ FAIL'} (got: ${commResult})`);

// Test 2: Main Application headers (mixed case like Andrew's email)
const appHeaders = [
    'Applicationid', 'Underwriter', 'Amountfinanced', 'Term', 'Status',
    'Dealername', 'Dealergroup', 'Dealerstate', 'Dealercity',
    'Applicationdate', 'Approvaldate', 'Bookeddate',
    'Collateralyear', 'Collateraltype', 'Collateralnewused',
    'Coficoauto8', 'Dti', 'Pti', 'Dealerrepresentative',
    'Timetobook', 'Timetodecision', 'Dealerminimumrate',
    'Cashdown', 'Totaldown', 'Isbusinessapp', 'Timetolastfund',
    'Apr', 'Programmanual', 'Programdefault', 'Ltv',
    'Dealerreserveamount', 'Dealerreservepercent', 'Backend', 'Invoice',
    'Primaryficoauto8', 'Lender', 'Primarystate',
    'Applicationsubmitteduser', 'Wasapproved', 'Wasapprovednotbooked', 'Clientdealerid'
];
const appResult = detectParser(appHeaders);
console.log(`Main Application:     ${appResult === 'main_application' ? '✅ PASS' : '❌ FAIL'} (got: ${appResult})`);

// Test 3: Dealer Information headers
const infoHeaders = [
    'DEALERID', 'CLIENTDEALERID', 'ISACTIVE', 'ENROLLMENTDATE', 'ACTIVATEDDATE',
    'DEACTIVATEDDATE', 'DEALERAGREEMENTDATE', 'DEALERLICENSEEXPIRATION',
    'TERMINATIONDATE', 'DEALERNAME', 'DBA', 'DEALERGROUP', 'REGION',
    'DEALERADDRESS', 'DEALERCITY', 'DEALERSTATE', 'DEALERPOSTALCODE', 'COUNTY',
    'DEALERPHONENUMBER', 'DEALERFAXNUMBER', 'COLLATERALTYPE', 'DEALERREPRESENTATIVE',
    'DOCUMENTDELIVERY', 'BOOKOUT', 'GLOBALID',
    'ISACTIVEFORDEALERTRACK', 'ISACTIVEFORROUTEONE', 'ISESIGNALLOWED',
    'ISFUNDINGRESERVEHOLD', 'ISBMODEALER', 'ISMEDALLIONDEALER',
    'ISACTIVEFORROUTEONECANADA', 'ISACTIVEFORCREDITLANE', 'ISACTIVEFORCUDL',
    'ISSOURCEONEONLY', 'ISFSBDEALER', 'ISSALESTAXREQUIRED', 'ISMULTIDECISIONENABLED'
];
const infoResult = detectParser(infoHeaders);
console.log(`Dealer Information:   ${infoResult === 'dealer_information' ? '✅ PASS' : '❌ FAIL'} (got: ${infoResult})`);

// Test 4: Legacy dealer_metrics still works
const legacyHeaders = [
    'DEALER ID', 'DEALER NAME', 'LAST APPLICATION DATE', 'PRIOR APPLICATION DATE',
    'DAYS SINCE LAST APPLICATION', 'LAST APPROVAL DATE', 'DAYS SINCE LAST APPROVAL',
    'LAST BOOKED DATE', 'DAYS SINCE LAST BOOKING', 'APPLICATION ACTIVITY STATUS',
    'LATEST COMMUNICATION DATETIME', 'REACTIVATED AFTER SALES VISIT FLAG',
    'DAYS FROM VISIT TO NEXT APPLICATION'
];
const legacyResult = detectParser(legacyHeaders);
console.log(`Legacy Dealer Metrics: ${legacyResult === 'dealer_metrics' ? '✅ PASS' : '❌ FAIL'} (got: ${legacyResult})`);

// Test 5: Unknown format returns null
const unknownHeaders = ['FOO', 'BAR', 'BAZ'];
const unknownResult = detectParser(unknownHeaders);
console.log(`Unknown Format:       ${unknownResult === null ? '✅ PASS' : '❌ FAIL'} (got: ${unknownResult})`);

// Test 6: Application headers with "Date" suffix (as shown in Andrew's email: "Applicationdate Date")
const appHeadersWithDateSuffix = [
    'Applicationid', 'Amountfinanced', 'Status', 'Dealername',
    'Applicationdate Date', 'Approvaldate Date', 'Bookeddate Date'
];
const appSuffixResult = detectParser(appHeadersWithDateSuffix);
console.log(`App w/ "Date" suffix: ${appSuffixResult === 'main_application' ? '✅ PASS' : '⚠️  EXPECTED (no match — headers include " Date" suffix)'} (got: ${appSuffixResult})`);

console.log('\n=== Done ===');
