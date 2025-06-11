export const objectSchemas = {
  clinicalTrialsSchema: {
    "protocolSection": {
      "description": "Contains detailed information about the clinical trial's protocol.",
      "type": "object",
      "identificationModule": {
        "description": "Core identifying information for the study.",
        "type": "object",
        "nctId": { "description": "The unique identifier for the study on ClinicalTrials.gov.", "type": "string" },
        "orgStudyIdInfo": {
          "description": "The study ID assigned by the sponsoring organization.",
          "type": "object",
          "id": { "description": "The organization's unique ID for the study.", "type": "string" }
        },
        "organization": {
          "description": "Information about the sponsoring organization.",
          "type": "object",
          "fullName": { "description": "The full name of the organization.", "type": "string" },
          "class": { "description": "The class of the organization (e.g., INDUSTRY, NIH).", "type": "string" }
        },
        "briefTitle": { "description": "A short, easy-to-understand title of the study.", "type": "string" },
        "officialTitle": { "description": "The full, scientific title of the study.", "type": "string" }
      },
      "statusModule": {
        "description": "Information on the current status of the trial and key dates.",
        "type": "object",
        "statusVerifiedDate": { "description": "The date the study's status was last verified.", "type": "string" },
        "overallStatus": { "description": "The overall recruitment status of the study.", "type": "string" },
        "expandedAccessInfo": {
          "description": "Information about whether the study drug is available through expanded access.",
          "type": "object",
          "hasExpandedAccess": { "description": "Boolean indicating if expanded access is available.", "type": "boolean" }
        },
        "startDateStruct": { "description": "The date when the first participant was enrolled.", "type": "object", "date": { "description": "The date value.", "type": "string" }, "type": { "description": "The type of date (e.g., ACTUAL, ESTIMATED).", "type": "string" } },
        "primaryCompletionDateStruct": { "description": "The date the final participant was examined for the primary outcome.", "type": "object", "date": { "description": "The date value.", "type": "string" }, "type": { "description": "The type of date.", "type": "string" } },
        "completionDateStruct": { "description": "The date the final participant was examined for all outcomes.", "type": "object", "date": { "description": "The date value.", "type": "string" }, "type": { "description": "The type of date.", "type": "string" } },
        "studyFirstSubmitDate": { "description": "The date the study was first submitted to ClinicalTrials.gov.", "type": "string" },
        "studyFirstSubmitQcDate": { "description": "The date the quality control review of the first submission was completed.", "type": "string" },
        "studyFirstPostDateStruct": { "description": "The date the study was first posted publicly.", "type": "object", "date": { "description": "The date value.", "type": "string" }, "type": { "description": "The type of date.", "type": "string" } },
        "resultsFirstSubmitDate": { "description": "The date the study results were first submitted.", "type": "string" },
        "resultsFirstSubmitQcDate": { "description": "The date the quality control review of the results was completed.", "type": "string" },
        "resultsFirstPostDateStruct": { "description": "The date the study results were first posted publicly.", "type": "object", "date": { "description": "The date value.", "type": "string" }, "type": { "description": "The type of date.", "type": "string" } },
        "lastUpdateSubmitDate": { "description": "The date the last update to the record was submitted.", "type": "string" },
        "lastUpdatePostDateStruct": { "description": "The date the last update was posted publicly.", "type": "object", "date": { "description": "The date value.", "type": "string" }, "type": { "description": "The type of date.", "type": "string" } }
      },
      "sponsorCollaboratorsModule": {
        "description": "Details about the study's sponsors and collaborators.",
        "type": "object",
        "responsibleParty": { "description": "The entity responsible for the conduct of the study.", "type": "object", "type": { "description": "Type of responsible party.", "type": "string" } },
        "leadSponsor": { "description": "The primary organization sponsoring the study.", "type": "object", "name": { "description": "Name of the lead sponsor.", "type": "string" }, "class": { "description": "Class of the lead sponsor.", "type": "string" } },
        "collaborators": {
          "description": "A list of collaborating organizations.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "name": { "description": "Name of the collaborator.", "type": "string" },
            "class": { "description": "Class of the collaborator.", "type": "string" }
          }
        }
      },
      "oversightModule": {
        "description": "Information regarding regulatory oversight.",
        "type": "object",
        "oversightHasDmc": { "description": "Indicates if a Data Monitoring Committee is overseeing the study.", "type": "boolean" }
      },
      "descriptionModule": {
        "description": "Brief and detailed narrative descriptions of the clinical trial.",
        "type": "object",
        "briefSummary": { "description": "A concise summary of the study.", "type": "string" },
        "detailedDescription": { "description": "A more extensive description of the study's purpose and methodology.", "type": "string" }
      },
      "conditionsModule": {
        "description": "The diseases or conditions being studied, along with relevant keywords.",
        "type": "object",
        "conditions": { "description": "List of conditions.", "type": "array", "representativeElement": { "type": "string" } },
        "keywords": { "description": "List of keywords.", "type": "array", "representativeElement": { "type": "string" } }
      },
      "designModule": {
        "description": "Comprehensive details on the study's design.",
        "type": "object",
        "studyType": { "description": "The type of study (e.g., Interventional, Observational).", "type": "string" },
        "phases": { "description": "The phases of the clinical trial.", "type": "array", "representativeElement": { "type": "string" } },
        "designInfo": {
          "description": "Information on the study's allocation, intervention model, primary purpose, and masking.",
          "type": "object",
          "allocation": { "description": "Method of assigning participants to groups.", "type": "string" },
          "interventionModel": { "description": "The model of intervention.", "type": "string" },
          "primaryPurpose": { "description": "The main purpose of the study.", "type": "string" },
          "maskingInfo": { "description": "Information about blinding.", "type": "object", "masking": { "description": "Type of masking.", "type": "string" } }
        },
        "enrollmentInfo": {
          "description": "Information about the number of participants enrolled in the study.",
          "type": "object",
          "count": { "description": "Number of enrolled participants.", "type": "number" },
          "type": { "description": "Type of enrollment count (e.g., ACTUAL, ESTIMATED).", "type": "string" }
        }
      },
      "armsInterventionsModule": {
        "description": "Describes the study arms (groups) and the interventions being administered.",
        "type": "object",
        "armGroups": {
          "description": "Details about each arm of the study.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "label": { "description": "The label for the arm group.", "type": "string" },
            "type": { "description": "The type of arm group (e.g., EXPERIMENTAL).", "type": "string" },
            "description": { "description": "Description of the arm group.", "type": "string" },
            "interventionNames": { "description": "Names of interventions for this group.", "type": "array", "representativeElement": { "type": "string" } }
          }
        },
        "interventions": {
          "description": "Details about each intervention.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "type": { "description": "Type of intervention (e.g., DRUG).", "type": "string" },
            "name": { "description": "Name of the intervention.", "type": "string" },
            "description": { "description": "Description of the intervention.", "type": "string" },
            "armGroupLabels": { "description": "Labels of arm groups receiving this intervention.", "type": "array", "representativeElement": { "type": "string" } },
            "otherNames": { "description": "Other names for the intervention.", "type": "array", "representativeElement": { "type": "string" } }
          }
        }
      },
      "outcomesModule": {
        "description": "Specifies the primary, secondary, and other outcome measures used to evaluate the intervention's effect.",
        "type": "object",
        "primaryOutcomes": {
          "description": "Details about primary outcome measures.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "measure": { "description": "The measure of the outcome.", "type": "string" },
            "description": { "description": "Description of the outcome measure.", "type": "string" },
            "timeFrame": { "description": "The time frame for the outcome measure.", "type": "string" }
          }
        }
      },
      "eligibilityModule": {
        "description": "Defines the inclusion and exclusion criteria for participant enrollment.",
        "type": "object",
        "eligibilityCriteria": { "description": "The specific criteria for participant inclusion and exclusion.", "type": "string" },
        "healthyVolunteers": { "description": "Indicates if the study accepts healthy volunteers.", "type": "boolean" },
        "sex": { "description": "The gender of participants eligible for the study.", "type": "string" },
        "minimumAge": { "description": "The minimum age for participants.", "type": "string" },
        "stdAges": { "description": "Standard age categories for participants.", "type": "array", "representativeElement": { "type": "string" } }
      },
      "contactsLocationsModule": {
        "description": "Lists study contacts, principal investigators, and the geographical locations of the trial sites.",
        "type": "object",
        "overallOfficials": {
          "description": "List of overall officials for the study.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "name": { "description": "Name of the official.", "type": "string" },
            "affiliation": { "description": "Affiliation of the official.", "type": "string" },
            "role": { "description": "Role of the official.", "type": "string" }
          }
        },
        "locations": {
          "description": "List of study locations.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "facility": { "description": "Facility name.", "type": "string" },
            "city": { "description": "City of the location.", "type": "string" },
            "state": { "description": "State of the location.", "type": "string" },
            "zip": { "description": "ZIP code of the location.", "type": "string" },
            "country": { "description": "Country of the location.", "type": "string" },
            "geoPoint": { "description": "Geographical coordinates.", "type": "object", "lat": { "type": "number" }, "lon": { "type": "number" } }
          }
        }
      },
      "referencesModule": {
        "description": "Citations for publications and links to other relevant resources related to the trial.",
        "type": "object",
        "references": {
          "description": "List of references.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "pmid": { "description": "PubMed ID.", "type": "string" },
            "type": { "description": "Type of reference.", "type": "string" },
            "citation": { "description": "Full citation.", "type": "string" }
          }
        },
        "seeAlsoLinks": {
          "description": "List of related links.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "label": { "description": "Label for the link.", "type": "string" },
            "url": { "description": "URL of the link.", "type": "string" }
          }
        }
      },
      "ipdSharingStatementModule": {
        "description": "Information regarding the plan and policies for sharing individual participant data (IPD).",
        "type": "object",
        "ipdSharing": { "description": "Indicates if there is a plan to share individual participant data.", "type": "string" },
        "description": { "description": "A description of the data sharing plan.", "type": "string" },
        "infoTypes": { "description": "The types of information that will be shared.", "type": "array", "representativeElement": { "type": "string" } },
        "timeFrame": { "description": "The timeframe for when data will be made available.", "type": "string" },
        "accessCriteria": { "description": "The criteria for gaining access to the shared data.", "type": "string" },
        "url": { "description": "A URL for more information about data sharing.", "type": "string" }
      }
    },
    "resultsSection": {
      "description": "Holds the results of the clinical trial.",
      "type": "object",
      "participantFlowModule": {
        "description": "Tracks the progression of participants through each stage of the trial.",
        "type": "object",
        "groups": {
          "description": "A list of groups in the participant flow.",
          "type": "array",
          "representativeElement": { "type": "object", "id": { "description": "Unique identifier for the group.", "type": "string" }, "title": { "description": "Title of the group.", "type": "string" }, "description": { "description": "Description of the group.", "type": "string" } }
        },
        "periods": {
          "description": "A list of periods in the study.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "title": { "description": "Title of the period.", "type": "string" },
            "milestones": {
              "description": "Milestones within the period.",
              "type": "array",
              "representativeElement": {
                "type": "object",
                "type": { "description": "Type of milestone (e.g., STARTED, COMPLETED).", "type": "string" },
                "achievements": { "description": "Achievements for the milestone.", "type": "array", "representativeElement": { "type": "object", "groupId": { "description": "ID of the group.", "type": "string" }, "numSubjects": { "description": "Number of subjects.", "type": "string" } } }
              }
            },
            "dropWithdraws": {
              "description": "Information on dropouts and withdrawals.",
              "type": "array",
              "representativeElement": {
                "type": "object",
                "type": { "description": "Type of withdrawal.", "type": "string" },
                "reasons": { "description": "Reasons for withdrawal.", "type": "array", "representativeElement": { "type": "object", "groupId": { "description": "ID of the group.", "type": "string" }, "numSubjects": { "description": "Number of subjects.", "type": "string" } } }
              }
            }
          }
        }
      },
      "baselineCharacteristicsModule": {
        "description": "Demographic and clinical characteristics of the participants at the beginning of the study.",
        "type": "object",
        "groups": { "description": "A list of groups for baseline characteristics.", "type": "array", "representativeElement": { "type": "object", "id": { "description": "Unique identifier for the group.", "type": "string" }, "title": { "description": "Title of the group.", "type": "string" }, "description": { "description": "Description of the group.", "type": "string" } } },
        "denoms": { "description": "Denominator counts for the groups.", "type": "array", "representativeElement": { "type": "object", "units": { "description": "Units for the denominator.", "type": "string" }, "counts": { "description": "Counts for each group.", "type": "array", "representativeElement": { "type": "object", "groupId": { "description": "ID of the group.", "type": "string" }, "value": { "description": "Value of the count.", "type": "string" } } } } },
        "measures": {
          "description": "A list of baseline measures.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "title": { "description": "Title of the measure.", "type": "string" },
            "paramType": { "description": "Parameter type (e.g., MEAN, COUNT_OF_PARTICIPANTS).", "type": "string" },
            "dispersionType": { "description": "Type of dispersion measure (e.g., STANDARD_DEVIATION).", "type": "string" },
            "unitOfMeasure": { "description": "The unit of the measure.", "type": "string" },
            "classes": { "description": "Classes within the measure.", "type": "array", "representativeElement": { "type": "object" } }
          }
        }
      },
      "outcomeMeasuresModule": {
        "description": "The reported data and statistical analyses for the outcome measures.",
        "type": "object",
        "outcomeMeasures": {
          "description": "A list of outcome measures.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "type": { "description": "Type of outcome (e.g., PRIMARY).", "type": "string" },
            "title": { "description": "Title of the outcome measure.", "type": "string" },
            "description": { "description": "Description of the outcome measure.", "type": "string" },
            "reportingStatus": { "description": "Reporting status (e.g., POSTED).", "type": "string" },
            "paramType": { "description": "Parameter type.", "type": "string" },
            "unitOfMeasure": { "description": "The unit of the measure.", "type": "string" },
            "timeFrame": { "description": "Time frame of the measure.", "type": "string" },
            "groups": { "description": "Groups for the outcome measure.", "type": "array", "representativeElement": { "type": "object" } },
            "denoms": { "description": "Denominators for the outcome measure.", "type": "array", "representativeElement": { "type": "object" } },
            "classes": { "description": "Classes for the outcome measure.", "type": "array", "representativeElement": { "type": "object" } }
          }
        }
      },
      "adverseEventsModule": {
        "description": "Information on all reported adverse events, both serious and other, during the trial.",
        "type": "object",
        "frequencyThreshold": { "description": "The threshold for reporting event frequencies.", "type": "string" },
        "timeFrame": { "description": "The time frame over which adverse events were collected.", "type": "string" },
        "eventGroups": {
          "description": "Groups for which adverse events are reported.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "id": { "description": "Unique identifier for the group.", "type": "string" },
            "title": { "description": "Title of the group.", "type": "string" },
            "description": { "description": "Description of the group.", "type": "string" },
            "deathsNumAffected": { "description": "Number of participants with deaths.", "type": "number" },
            "deathsNumAtRisk": { "description": "Number of participants at risk for death.", "type": "number" },
            "seriousNumAffected": { "description": "Number of participants with serious adverse events.", "type": "number" },
            "seriousNumAtRisk": { "description": "Number of participants at risk for serious adverse events.", "type": "number" },
            "otherNumAffected": { "description": "Number of participants with other adverse events.", "type": "number" },
            "otherNumAtRisk": { "description": "Number of participants at risk for other adverse events.", "type": "number" }
          }
        },
        "seriousEvents": {
          "description": "A list of serious adverse events.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "term": { "description": "The term for the adverse event.", "type": "string" },
            "organSystem": { "description": "The organ system affected.", "type": "string" },
            "sourceVocabulary": { "description": "The source vocabulary for the term (e.g., MedDRA).", "type": "string" },
            "assessmentType": { "description": "Type of assessment (e.g., SYSTEMATIC_ASSESSMENT).", "type": "string" },
            "stats": { "description": "Statistics for the event.", "type": "array", "representativeElement": { "type": "object", "groupId": { "type": "string" }, "numEvents": { "type": "number" }, "numAffected": { "type": "number" }, "numAtRisk": { "type": "number" } } }
          }
        },
        "otherEvents": {
          "description": "A list of other (non-serious) adverse events.",
          "type": "array",
          "representativeElement": {
            "type": "object",
            "term": { "description": "The term for the adverse event.", "type": "string" },
            "organSystem": { "description": "The organ system affected.", "type": "string" },
            "sourceVocabulary": { "description": "The source vocabulary for the term.", "type": "string" },
            "assessmentType": { "description": "Type of assessment.", "type": "string" },
            "stats": { "description": "Statistics for the event.", "type": "array", "representativeElement": { "type": "object", "groupId": { "type": "string" }, "numEvents": { "type": "number" }, "numAffected": { "type": "number" }, "numAtRisk": { "type": "number" } } }
          }
        }
      },
      "moreInfoModule": {
        "description": "Contains contact information for inquiries about the study results and any agreements.",
        "type": "object",
        "certainAgreement": { "description": "Information about any restrictive agreements on the PI's ability to discuss or publish results.", "type": "object", "piSponsorEmployee": { "type": "boolean" }, "restrictiveAgreement": { "type": "boolean" } },
        "pointOfContact": { "description": "The point of contact for scientific inquiries about the study.", "type": "object", "title": { "type": "string" }, "organization": { "type": "string" }, "email": { "type": "string" }, "phone": { "type": "string" } }
      }
    },
    "documentSection": {
      "description": "Provides information about and links to large documents related to the clinical trial.",
      "type": "object",
      "largeDocumentModule": {
        "description": "A list of supplementary documents.",
        "type": "object",
        "largeDocs": {
          "type": "array",
          "representativeElement": {
            "type": "object",
            "typeAbbrev": { "description": "Abbreviation for the document type.", "type": "string" },
            "hasProtocol": { "description": "Indicates if the document is a protocol.", "type": "boolean" },
            "hasSap": { "description": "Indicates if the document is a statistical analysis plan.", "type": "boolean" },
            "hasIcf": { "description": "Indicates if the document is an informed consent form.", "type": "boolean" },
            "label": { "description": "The label for the document.", "type": "string" },
            "date": { "description": "The date of the document.", "type": "string" },
            "uploadDate": { "description": "The date the document was uploaded.", "type": "string" },
            "filename": { "description": "The filename of the document.", "type": "string" },
            "size": { "description": "The size of the document in bytes.", "type": "number" }
          }
        }
      }
    },
    "derivedSection": {
      "description": "Contains derived and browseable information related to the clinical trial.",
      "type": "object",
      "miscInfoModule": {
        "description": "Miscellaneous derived information.",
        "type": "object",
        "versionHolder": { "description": "The date of the current version of the study data.", "type": "string" }
      },
      "conditionBrowseModule": {
        "description": "Structured terms to allow browsing for trials by medical conditions and diseases.",
        "type": "object",
        "meshes": { "description": "MeSH terms for conditions.", "type": "array", "representativeElement": { "type": "object", "id": { "description": "MeSH ID.", "type": "string" }, "term": { "description": "MeSH term.", "type": "string" } } },
        "ancestors": { "description": "MeSH ancestor terms.", "type": "array", "representativeElement": { "type": "object", "id": { "description": "Ancestor MeSH ID.", "type": "string" }, "term": { "description": "Ancestor MeSH term.", "type": "string" } } },
        "browseLeaves": { "description": "Leaves of the MeSH condition browse tree.", "type": "array", "representativeElement": { "type": "object", "id": { "description": "Leaf ID.", "type": "string" }, "name": { "description": "Leaf name.", "type": "string" }, "asFound": { "description": "Term as found in the data.", "type": "string" }, "relevance": { "description": "Relevance of the term.", "type": "string" } } },
        "browseBranches": { "description": "Branches of the MeSH condition browse tree.", "type": "array", "representativeElement": { "type": "object", "abbrev": { "description": "Branch abbreviation.", "type": "string" }, "name": { "description": "Branch name.", "type": "string" } } }
      },
      "interventionBrowseModule": {
        "description": "Structured terms to allow browsing for trials by interventions like drugs or treatments.",
        "type": "object",
        "meshes": { "description": "MeSH terms for interventions.", "type": "array", "representativeElement": { "type": "object", "id": { "description": "MeSH ID.", "type": "string" }, "term": { "description": "MeSH term.", "type": "string" } } },
        "ancestors": { "description": "MeSH ancestor terms.", "type": "array", "representativeElement": { "type": "object", "id": { "description": "Ancestor MeSH ID.", "type": "string" }, "term": { "description": "Ancestor MeSH term.", "type": "string" } } },
        "browseLeaves": { "description": "Leaves of the MeSH intervention browse tree.", "type": "array", "representativeElement": { "type": "object", "id": { "description": "Leaf ID.", "type": "string" }, "name": { "description": "Leaf name.", "type": "string" }, "asFound": { "description": "Term as found in the data.", "type": "string" }, "relevance": { "description": "Relevance of the term.", "type": "string" } } },
        "browseBranches": { "description": "Branches of the MeSH intervention browse tree.", "type": "array", "representativeElement": { "type": "object", "abbrev": { "description": "Branch abbreviation.", "type": "string" }, "name": { "description": "Branch name.", "type": "string" } } }
      }
    },
    "hasResults": {
      "description": "A boolean flag indicating whether the clinical trial has posted results.",
      "type": "boolean"
    }
  },
  alterationSummary: {},
  // ... other entity schemas
};

// Helper function to convert a schema object to a string for the AI
export function schemaToString(schema) {
  let schemaString = "Object Schema:\n";
  for (const path in schema) {
    if (schema.hasOwnProperty(path)) {
      const details = schema[path];
      schemaString += `- Path: "${path}"\n`;
      if (details.type) {
        schemaString += `  - Type: ${details.type}\n`;
      }
      schemaString += `  - Description: ${details.description}\n`;
      if (details.itemSchema) {
        schemaString += `  - Array Item Structure:\n`;
        for (const itemKey in details.itemSchema) {
          const itemDetails = details.itemSchema[itemKey];
          schemaString += `    - Path: "${itemKey}" (within each item)\n`;
          if (itemDetails.type) {
            schemaString += `      - Type: ${itemDetails.type}\n`;
          }
          schemaString += `      - Description: ${itemDetails.description}\n`;
        }
      }
    }
  }
  return schemaString;
}
