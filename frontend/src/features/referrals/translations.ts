/**
 * DSA OS — Referral Portal Localization Dictionary
 *
 * Supports English (en) and हिन्दी (hi) language switching with complete coverage:
 * - Brand & header labels
 * - Section titles & order markers
 * - Field labels, placeholders, and tooltips
 * - Selection chips, segmented toggles & presets
 * - Date picker instructions and boundary validations
 * - PIN code lookup feedback and manual address editing
 * - Document upload states, quarantine notices, and file handlers
 * - Validation error messages
 * - Lead submission confirmation dossier
 */

export type Language = 'en' | 'hi'

export interface ReferralTranslations {
  // Brand & Header
  portalTagline: string
  portalVersion: string
  partnerDesk: string
  submitReferral: string
  encryptedTerminal: string
  financialServices: string

  // Language selector
  selectLanguage: string
  english: string
  hindi: string

  // Screen 1: Mobile Entry & Partner Identification
  enterMobileNumber: string
  registeredPartnerMobile: string
  verifiedMobile: string
  tenOfTenVerified: string
  checkingDatabase: string
  verifying: string
  continue: string
  mobileStartError: string
  enterValidMobileError: string
  enterPartnerNameError: string
  dbUnavailableRetry: string
  retry: string
  yourFullNameNewPartner: string
  newPartnerHint: string
  newPartnerPlaceholder: string

  // Screen 1.5: OTP Verification
  verifyMobileViaOtp: string
  otpVerificationHeading: string
  otpSentSubtext: string
  enterOtpLabel: string
  otpPlaceholder: string
  verifyAndContinue: string
  verifyingOtp: string
  resendOtp: string
  resendIn: string
  otpExpired: string
  otpInvalid: string
  changeMobileNumber: string
  sendingOtp: string
  otpSentSuccess: string
  smsGatewayBadge: string

  // Screen 2: Navigation & Submitter Banner
  back: string
  partner: string
  edit: string
  newLeadSubmission: string
  kycBase: string

  // Section 1: Customer Details
  customerDetailsHeading: string
  customerFullName: string
  customerNamePlaceholder: string
  customerMobileNumber: string
  customerMobilePlaceholder: string

  // Section 2: Loan Type
  loanTypeHeading: string
  loanTypeLabel: string
  car: string
  commercialVehicle: string
  tractor: string
  twoWheeler: string

  // Section 3: Vehicle & Loan Details
  vehicleLoanDetailsHeading: string
  requestedLoanAmount: string
  presetSelected: string
  dealerCustomerPincode: string
  pincodePlaceholder: string
  cityStateLabel: string
  townDistrictStateLabel: string
  autoBadge: string
  editLocation: string
  saveLocation: string
  cityLabel: string
  townLocalityLabel: string
  districtLabel: string
  stateLabel: string
  pincodeLookupError: string
  pincodeInvalidError: string
  lookingUpLocation: string

  // Section 4: Expected Loan Required Date
  expectedLoanRequiredDateHeading: string
  expectedLoanRequiredDateLabel: string
  expectedDateHelpText: string
  dateRequiredError: string
  datePastError: string
  dateFutureLimitError: string

  // Section 5: Vehicle Condition
  vehicleConditionHeading: string
  vehicleConditionLabel: string
  usedCar: string
  newCar: string
  vehicleRegNoLabel: string
  vehicleRegNoPlaceholder: string

  // Section 6: Document Uploads
  documentUploadsHeading: string
  documentUploadsSubtitle: string
  aadhaarCard: string
  aadhaarPrompt: string
  panCard: string
  panPrompt: string
  rcBook: string
  rcMandatoryForUsed: string
  rcPromptBold: string
  rcPromptSub: string
  upload: string
  replace: string
  uploadedQuarantined: string
  uploadingToQuarantine: string
  uploadSizeError: string
  uploadTypeError: string

  // Submission & Validation
  submitLead: string
  submittingLead: string
  formErrorCustomerName: string
  formErrorCustomerMobile: string
  formErrorVehicleCondition: string
  formErrorVehicleRegNo: string
  formErrorLoanAmount: string
  formErrorAadhaar: string
  formErrorPan: string
  formErrorRc: string
  formErrorDate: string
  submissionFailedGeneric: string

  // Screen 3: Confirmation
  leadSuccessfullySubmitted: string
  successSubtext: string
  caseNumber: string
  trackingId: string
  referralPartner: string
  borrower: string
  vehicleConditionSummary: string
  loanAmountSummary: string
  expectedDateSummary: string
  submitAnotherLead: string
}

export const REFERRAL_TRANSLATIONS: Record<Language, ReferralTranslations> = {
  en: {
    portalTagline: 'PARTNER REFERRAL NETWORK',
    portalVersion: 'Portal v2.5',
    partnerDesk: 'PARTNER DESK',
    submitReferral: 'Submit Referral',
    encryptedTerminal: 'Encrypted Dealership Terminal',
    financialServices: 'Jai Automobiles Financial Services',

    selectLanguage: 'Language',
    english: 'English',
    hindi: 'हिन्दी',

    enterMobileNumber: 'Enter Mobile Number',
    registeredPartnerMobile: 'Registered Partner Mobile',
    verifiedMobile: 'Verified Mobile',
    tenOfTenVerified: '10/10 Verified',
    checkingDatabase: 'Checking database...',
    verifying: 'Verifying...',
    continue: 'Continue',
    mobileStartError: 'Mobile number must start with 6, 7, 8, or 9.',
    enterValidMobileError: 'Please enter a valid 10-digit Indian mobile number.',
    enterPartnerNameError: 'Please enter your name to register as a partner.',
    dbUnavailableRetry: 'Database unavailable. Please check connection and retry.',
    retry: 'Retry',
    yourFullNameNewPartner: 'Your Full Name (New Partner) *',
    newPartnerHint: 'Enter your name to register as a partner. Profile will be created upon Continue.',
    newPartnerPlaceholder: 'e.g. Vikram Sharma',

    verifyMobileViaOtp: 'Verify Mobile via OTP',
    otpVerificationHeading: 'Mobile OTP Verification',
    otpSentSubtext: 'We have sent a 6-digit verification code via Airtel SMS to',
    enterOtpLabel: 'Enter 6-Digit OTP',
    otpPlaceholder: '••••••',
    verifyAndContinue: 'Verify & Continue',
    verifyingOtp: 'Verifying OTP...',
    resendOtp: 'Resend OTP',
    resendIn: 'Resend in',
    otpExpired: 'OTP has expired. Please request a new code.',
    otpInvalid: 'Invalid OTP. Please check the code and try again.',
    changeMobileNumber: 'Change Number',
    sendingOtp: 'Sending OTP via SMS...',
    otpSentSuccess: 'OTP sent successfully to your mobile number.',
    smsGatewayBadge: 'Secured via Jai Automobiles SMS Gateway (Airtel SIM)',

    back: 'Back',
    partner: 'Partner: ',
    edit: 'Edit',
    newLeadSubmission: 'New Lead Submission',
    kycBase: 'KYC Base',

    customerDetailsHeading: '1. CUSTOMER DETAILS',
    customerFullName: 'Customer Full Name',
    customerNamePlaceholder: 'Vikramaditya Rathore',
    customerMobileNumber: 'Customer Mobile Number',
    customerMobilePlaceholder: '9820145692',

    loanTypeHeading: '2. LOAN TYPE',
    loanTypeLabel: 'Loan Type',
    car: 'Car',
    commercialVehicle: 'CV',
    tractor: 'Tractor',
    twoWheeler: 'Two Wheeler',

    vehicleLoanDetailsHeading: '3. VEHICLE & LOAN DETAILS',
    requestedLoanAmount: 'Requested Loan Amount',
    presetSelected: ' (Selected)',
    dealerCustomerPincode: 'Dealer / Customer PIN Code',
    pincodePlaceholder: '400001',
    cityStateLabel: 'CITY & STATE',
    townDistrictStateLabel: 'TOWN / LOCALITY, DISTRICT & STATE',
    autoBadge: 'Auto',
    editLocation: 'Edit',
    saveLocation: 'Done',
    cityLabel: 'City / District',
    townLocalityLabel: 'Town / Locality',
    districtLabel: 'District',
    stateLabel: 'State',
    pincodeLookupError: 'Could not resolve location for PIN code. You can enter it manually.',
    pincodeInvalidError: 'Enter a valid 6-digit Indian PIN code.',
    lookingUpLocation: 'Locating...',

    expectedLoanRequiredDateHeading: '4. EXPECTED LOAN REQUIRED DATE',
    expectedLoanRequiredDateLabel: 'Expected Loan Required Date',
    expectedDateHelpText: 'Select when the borrower needs this loan disbursed (Today up to 1 year ahead).',
    dateRequiredError: 'Please select an expected loan required date.',
    datePastError: 'Expected Loan Required Date cannot be in the past.',
    dateFutureLimitError: 'Expected Loan Required Date cannot be more than 1 year in advance.',

    vehicleConditionHeading: '5. VEHICLE CONDITION',
    vehicleConditionLabel: 'Vehicle Condition',
    usedCar: 'Used Car',
    newCar: 'New Car',
    vehicleRegNoLabel: 'Vehicle Registration Number',
    vehicleRegNoPlaceholder: 'MH 02 CK 4821',

    documentUploadsHeading: '6. DOCUMENT UPLOADS',
    documentUploadsSubtitle: 'Attach borrower documents for automated OCR intake and verification.',
    aadhaarCard: 'Aadhaar Card',
    aadhaarPrompt: 'Tap to attach or scan Aadhaar (PDF/JPG)',
    panCard: 'PAN Card',
    panPrompt: 'Tap to attach or scan PAN Card (PDF/JPG)',
    rcBook: 'RC Book (Registration Certificate)',
    rcMandatoryForUsed: 'Mandatory for Used Car',
    rcPromptBold: 'Tap to scan RC or browse file',
    rcPromptSub: 'Supports PDF, JPG, PNG up to 10MB',
    upload: 'Upload',
    replace: 'Replace',
    uploadedQuarantined: 'Uploaded (Quarantined)',
    uploadingToQuarantine: 'Uploading to secure quarantine...',
    uploadSizeError: 'File size exceeds 10MB limit.',
    uploadTypeError: 'Only PDF, JPEG, or PNG files are supported.',

    submitLead: 'Submit Lead',
    submittingLead: 'Submitting Lead...',
    formErrorCustomerName: 'Please enter Customer Full Name.',
    formErrorCustomerMobile: 'Customer Mobile Number must be a valid 10-digit Indian number starting with 6, 7, 8, or 9.',
    formErrorVehicleCondition: 'Please select Vehicle Condition (Used Car or New Car).',
    formErrorVehicleRegNo: 'Vehicle Registration Number is mandatory for Used Car leads.',
    formErrorLoanAmount: 'Requested Loan Amount must be at least ₹10,000.',
    formErrorAadhaar: 'Aadhaar Card is mandatory for every lead submission. Please attach Aadhaar.',
    formErrorPan: 'PAN Card is mandatory for every lead submission. Please attach PAN Card.',
    formErrorRc: 'RC Book is mandatory for Used Car loan applications. Please upload RC copy.',
    formErrorDate: 'Please provide a valid Expected Loan Required Date.',
    submissionFailedGeneric: 'Lead submission failed. Please verify your entries and try again.',

    leadSuccessfullySubmitted: 'Lead Successfully Submitted!',
    successSubtext: 'The loan lead has been registered in the operations queue with verified referral attribution.',
    caseNumber: 'Case Number',
    trackingId: 'Tracking ID',
    referralPartner: 'Referral Partner',
    borrower: 'Borrower',
    vehicleConditionSummary: 'Vehicle Condition',
    loanAmountSummary: 'Loan Amount',
    expectedDateSummary: 'Expected Loan Date',
    submitAnotherLead: 'Submit Another Lead',
  },

  hi: {
    portalTagline: 'पार्टनर रेफरल नेटवर्क',
    portalVersion: 'पोर्टल v2.5',
    partnerDesk: 'पार्टनर डेस्क',
    submitReferral: 'रेफरल सबमिट करें',
    encryptedTerminal: 'सुरक्षित डीलरशिप टर्मिनल',
    financialServices: 'जय ऑटोमोबाइल्स फाइनेंशियल सर्विसेज',

    selectLanguage: 'भाषा',
    english: 'English',
    hindi: 'हिन्दी',

    enterMobileNumber: 'मोबाइल नंबर दर्ज करें',
    registeredPartnerMobile: 'पंजीकृत पार्टनर मोबाइल नंबर',
    verifiedMobile: 'सत्यापित मोबाइल',
    tenOfTenVerified: '10/10 सत्यापित',
    checkingDatabase: 'डेटाबेस जांच रहे हैं...',
    verifying: 'जांच जारी है...',
    continue: 'आगे बढ़ें',
    mobileStartError: 'मोबाइल नंबर 6, 7, 8 या 9 से शुरू होना चाहिए।',
    enterValidMobileError: 'कृपया 10 अंकों का वैध भारतीय मोबाइल नंबर दर्ज करें।',
    enterPartnerNameError: 'पार्टनर के रूप में पंजीकरण के लिए अपना नाम दर्ज करें।',
    dbUnavailableRetry: 'डेटाबेस उपलब्ध नहीं है। कृपया कनेक्शन जांचें और पुनः प्रयास करें।',
    retry: 'पुनः प्रयास करें',
    yourFullNameNewPartner: 'आपका पूरा नाम (नया पार्टनर) *',
    newPartnerHint: 'पार्टनर के रूप में पंजीकरण के लिए अपना नाम दर्ज करें। आगे बढ़ने पर प्रोफ़ाइल बन जाएगी।',
    newPartnerPlaceholder: 'उदा. विक्रम शर्मा',

    verifyMobileViaOtp: 'ओटीपी द्वारा मोबाइल सत्यापित करें',
    otpVerificationHeading: 'मोबाइल ओटीपी सत्यापन',
    otpSentSubtext: 'हमने एयरटेल एसएमएस द्वारा 6-अंकों का सत्यापन कोड भेजा है:',
    enterOtpLabel: '6-अंकों का ओटीपी दर्ज करें',
    otpPlaceholder: '••••••',
    verifyAndContinue: 'सत्यापित करें और आगे बढ़ें',
    verifyingOtp: 'ओटीपी सत्यापित हो रहा है...',
    resendOtp: 'ओटीपी पुनः भेजें',
    resendIn: 'पुनः भेजें',
    otpExpired: 'ओटीपी समाप्त हो गया है। कृपया नया कोड मांगें।',
    otpInvalid: 'अमान्य ओटीपी। कृपया कोड जांचें और पुनः प्रयास करें।',
    changeMobileNumber: 'नंबर बदलें',
    sendingOtp: 'एसएमएस द्वारा ओटीपी भेजा जा रहा है...',
    otpSentSuccess: 'आपके मोबाइल नंबर पर ओटीपी सफलतापूर्वक भेजा गया।',
    smsGatewayBadge: 'जय ऑटोमोबाइल्स एसएमएस गेटवे द्वारा सुरक्षित (एयरटेल सिम)',

    back: 'वापस',
    partner: 'पार्टनर: ',
    edit: 'बदलें',
    newLeadSubmission: 'नया लीड सबमिशन',
    kycBase: 'केवाईसी बेस',

    customerDetailsHeading: '1. ग्राहक विवरण (CUSTOMER DETAILS)',
    customerFullName: 'ग्राहक का पूरा नाम',
    customerNamePlaceholder: 'उदा. विक्रमादित्य राठौड़',
    customerMobileNumber: 'ग्राहक का मोबाइल नंबर',
    customerMobilePlaceholder: '9820145692',

    loanTypeHeading: '2. ऋण का प्रकार (LOAN TYPE)',
    loanTypeLabel: 'ऋण का प्रकार',
    car: 'कार',
    commercialVehicle: 'कमर्शियल वाहन',
    tractor: 'ट्रैक्टर',
    twoWheeler: 'दोपहिया (बाइक)',

    vehicleLoanDetailsHeading: '3. वाहन एवं ऋण विवरण (VEHICLE & LOAN DETAILS)',
    requestedLoanAmount: 'अपेक्षित ऋण राशि',
    presetSelected: ' (चयनित)',
    dealerCustomerPincode: 'डीलर / ग्राहक का पिन कोड',
    pincodePlaceholder: '400001',
    cityStateLabel: 'शहर और राज्य',
    townDistrictStateLabel: 'कस्बा, जिला और राज्य',
    autoBadge: 'स्वतः',
    editLocation: 'संशोधित करें',
    saveLocation: 'सहेजें',
    cityLabel: 'शहर / जिला',
    townLocalityLabel: 'कस्बा / इलाका',
    districtLabel: 'जिला',
    stateLabel: 'राज्य',
    pincodeLookupError: 'पिन कोड का स्थान प्राप्त नहीं हुआ। आप इसे मैन्युअल रूप से दर्ज कर सकते हैं।',
    pincodeInvalidError: 'कृपया 6 अंकों का वैध भारतीय पिन कोड दर्ज करें।',
    lookingUpLocation: 'स्थान खोज रहे हैं...',

    expectedLoanRequiredDateHeading: '4. ऋण की अपेक्षित तारीख (EXPECTED LOAN REQUIRED DATE)',
    expectedLoanRequiredDateLabel: 'ऋण किस तारीख तक चाहिए?',
    expectedDateHelpText: 'कृपया वह तारीख चुनें जब तक ग्राहक को ऋण राशि की आवश्यकता है (आज से 1 वर्ष के भीतर)।',
    dateRequiredError: 'कृपया ऋण की अपेक्षित तारीख चुनें।',
    datePastError: 'ऋण की अपेक्षित तारीख पिछली तारीख नहीं हो सकती।',
    dateFutureLimitError: 'ऋण की अपेक्षित तारीख आज से 1 वर्ष से अधिक आगे की नहीं हो सकती।',

    vehicleConditionHeading: '5. वाहन की स्थिति (VEHICLE CONDITION)',
    vehicleConditionLabel: 'वाहन की स्थिति',
    usedCar: 'पुरानी कार (Used Car)',
    newCar: 'नई कार (New Car)',
    vehicleRegNoLabel: 'वाहन पंजीकरण संख्या (गाड़ी नंबर)',
    vehicleRegNoPlaceholder: 'MH 02 CK 4821',

    documentUploadsHeading: '6. दस्तावेज़ अपलोड (DOCUMENT UPLOADS)',
    documentUploadsSubtitle: 'स्वचालित ओसीआर और सत्यापन के लिए ग्राहक के दस्तावेज़ संलग्न करें।',
    aadhaarCard: 'आधार कार्ड',
    aadhaarPrompt: 'आधार कार्ड संलग्न करने के लिए टैप करें (PDF/JPG)',
    panCard: 'पैन कार्ड',
    panPrompt: 'पैन कार्ड संलग्न करने के लिए टैप करें (PDF/JPG)',
    rcBook: 'आरसी बुक (Registration Certificate)',
    rcMandatoryForUsed: 'पुरानी गाड़ी के लिए अनिवार्य',
    rcPromptBold: 'आरसी स्कैन करने या फ़ाइल चुनने के लिए टैप करें',
    rcPromptSub: 'PDF, JPG, PNG (10MB तक समर्थित)',
    upload: 'अपलोड करें',
    replace: 'बदलें',
    uploadedQuarantined: 'अपलोड हो गया (सुरक्षित)',
    uploadingToQuarantine: 'सुरक्षित रूप से अपलोड हो रहा है...',
    uploadSizeError: 'फ़ाइल का आकार 10MB की सीमा से अधिक है।',
    uploadTypeError: 'केवल PDF, JPEG, या PNG फ़ाइलें समर्थित हैं।',

    submitLead: 'लीड सबमिट करें',
    submittingLead: 'लीड सबमिट हो रही है...',
    formErrorCustomerName: 'कृपया ग्राहक का पूरा नाम दर्ज करें।',
    formErrorCustomerMobile: 'ग्राहक का मोबाइल नंबर 6, 7, 8 या 9 से शुरू होने वाला 10 अंकों का होना चाहिए।',
    formErrorVehicleCondition: 'कृपया वाहन की स्थिति (पुरानी कार या नई कार) चुनें।',
    formErrorVehicleRegNo: 'पुरानी कार के लिए वाहन पंजीकरण संख्या अनिवार्य है।',
    formErrorLoanAmount: 'अपेक्षित ऋण राशि कम से कम ₹10,000 होनी चाहिए।',
    formErrorAadhaar: 'लीड सबमिशन के लिए आधार कार्ड अनिवार्य है। कृपया आधार संलग्न करें।',
    formErrorPan: 'लीड सबमिशन के लिए पैन कार्ड अनिवार्य है। कृपया पैन कार्ड संलग्न करें।',
    formErrorRc: 'पुरानी कार ऋण आवेदन के लिए आरसी अनिवार्य है। कृपया आरसी अपलोड करें।',
    formErrorDate: 'कृपया ऋण की वैध अपेक्षित तारीख प्रदान करें।',
    submissionFailedGeneric: 'लीड सबमिशन विफल रहा। कृपया अपनी प्रविष्टियों की पुष्टि करें और पुनः प्रयास करें।',

    leadSuccessfullySubmitted: 'लीड सफलतापूर्वक सबमिट हो गई!',
    successSubtext: 'लोन लीड को सत्यापित पार्टनर रेफरल के साथ संचालन कतार में पंजीकृत कर दिया गया है।',
    caseNumber: 'केस संख्या',
    trackingId: 'ट्रैकिंग आईडी',
    referralPartner: 'रेफरल पार्टनर',
    borrower: 'ग्राहक (उधारकर्ता)',
    vehicleConditionSummary: 'वाहन की स्थिति',
    loanAmountSummary: 'ऋण राशि',
    expectedDateSummary: 'ऋण की अपेक्षित तारीख',
    submitAnotherLead: 'दूसरी लीड सबमिट करें',
  },
}
