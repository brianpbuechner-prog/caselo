import type { SisCatalog } from '../types'

// Infinite Campus Ad Hoc fields (Filter Designer, Query Wizard, Data Export).
// Default header names come from public Infinite Campus knowledge base
// articles (kb.infinitecampus.com), checked October 2026:
//   - Student Filter Fields for Ad hoc Reporting (field names by folder)
//   - Viewing Aggregated Attendance Using Ad Hoc (attChronicAbsenteeism.*)
//   - GPA Calculations (cumGPA.*, unweightedGPA.*, gpa.*)
//   - Grades, and state guides that cite Student > Grading > Grading
//     Detail > grading.score (grading.*)
//   - Virginia behavior guide (behaviorDetail.*)
// A default header that no public source shows with its object prefix is
// marked unverified.
//
// Districts can rename columns, so each field also lists aliases for fuzzy
// matching. Aliases include the labels Infinite Campus shows in Filter
// Designer (for example "Absenteeism Percentage") and plain-language names
// a district is likely to use. Aliases are matching hints, not documented
// header names. Avoid one-word aliases that also appear in unrelated
// headers ("absences", "class", "last"), since a whole-word match scores
// above the fuzzy threshold.

export const infiniteCampus: SisCatalog = {
  id: 'infinite-campus',
  name: 'Infinite Campus',
  exportSources: ['Filter Designer', 'Query Wizard', 'Data Export'],
  studentKeys: ['studentNumber', 'stateID'],
  fields: [
    // Student identity
    {
      key: 'studentNumber',
      label: 'Student number',
      category: 'identity',
      kind: 'id',
      defaultHeaders: ['student.studentNumber'],
      aliases: ['student number', 'student id', 'student num', 'local id', 'id number', 'student no', 'stu number', 'local student id', 'district student id', 'stu id', 'perm id', 'permanent id'],
    },
    {
      key: 'stateID',
      label: 'State ID',
      category: 'identity',
      kind: 'id',
      defaultHeaders: ['student.stateID'],
      aliases: ['state id', 'state student id', 'ssid', 'marss', 'marss number', 'state number', 'state student number', 'statewide id', 'state assigned id'],
    },
    {
      key: 'lastName',
      label: 'Last name',
      category: 'identity',
      kind: 'text',
      defaultHeaders: ['student.lastName'],
      aliases: ['last name', 'surname', 'family name', 'student last name', 'legal last name', 'lname'],
    },
    {
      key: 'firstName',
      label: 'First name',
      category: 'identity',
      kind: 'text',
      defaultHeaders: ['student.firstName'],
      aliases: ['first name', 'given name', 'student first name', 'legal first name', 'fname'],
    },
    {
      key: 'grade',
      label: 'Grade level',
      category: 'identity',
      kind: 'grade',
      defaultHeaders: ['student.grade'],
      aliases: ['grade level', 'current grade', 'student grade', 'grade', 'gr', 'enrollment grade', 'grade lvl', 'gr level'],
    },

    // Attendance summary (one row per student)
    {
      key: 'absenteeismPercentage',
      label: 'Absence percentage',
      category: 'attendanceSummary',
      kind: 'percent',
      defaultHeaders: ['attChronicAbsenteeism.absenteeismPercentage'],
      aliases: [
        'absenteeism percentage',
        'absence percentage',
        'percent absent',
        'absent percent',
        'absence percent',
        'absence rate',
        'absenteeism rate',
        'pct absent',
        'percent absenteeism',
        'absenteeism pct',
        'chronic absenteeism percentage',
        'chronic absence rate',
        'percent of days absent',
      ],
      note: 'Accepts 12.5, 12.5%, or 0.125.',
    },
    {
      key: 'daysAbsent',
      label: 'Days absent',
      category: 'attendanceSummary',
      kind: 'number',
      defaultHeaders: ['attChronicAbsenteeism.daysAbsent'],
      aliases: ['days absent', 'absent days', 'total absences', 'total days absent', 'number of absences', 'absence count', 'days missed', 'absences ytd'],
    },
    {
      key: 'scheduledDays',
      label: 'Scheduled days',
      category: 'attendanceSummary',
      kind: 'number',
      defaultHeaders: ['attChronicAbsenteeism.scheduledDays'],
      aliases: ['scheduled days', 'days scheduled', 'days enrolled', 'enrolled days', 'membership days', 'days in membership', 'days possible', 'possible days', 'instructional days'],
    },
    {
      key: 'chronicallyAbsent',
      label: 'Chronically absent (district flag)',
      category: 'attendanceSummary',
      kind: 'flag',
      defaultHeaders: ['attChronicAbsenteeism.chronicallyAbsent'],
      aliases: ['chronically absent', 'chronic absentee', 'chronic absence', 'chronic flag', 'chronic absenteeism flag', 'chronically absent flag', 'is chronically absent'],
      note: '1 or 0, or Y or N.',
    },

    // GPA
    {
      key: 'cumGPA',
      label: 'Cumulative GPA',
      category: 'gpa',
      kind: 'number',
      // gpa.cumGpaBasic is the Learner Portfolio > GPA folder.
      defaultHeaders: ['cumGPA.cumGPA', 'gpa.cumGpaBasic'],
      aliases: ['cumulative gpa', 'cum gpa', 'weighted gpa', 'gpa', 'cumulative grade point average', 'overall gpa', 'gpa cumulative', 'cum gpa basic'],
    },
    {
      key: 'unweightedGPA',
      label: 'Unweighted cumulative GPA',
      category: 'gpa',
      kind: 'number',
      defaultHeaders: ['unweightedGPA.cumGPA', 'gpa.cumGPAUnweighted'],
      aliases: ['unweighted gpa', 'unweighted cumulative gpa', 'unweighted cum gpa', 'gpa unweighted', 'cum gpa unweighted', 'unweighted grade point average'],
    },

    // Behavior incidents (many rows per student)
    {
      key: 'incidentID',
      label: 'Incident ID',
      category: 'behavior',
      kind: 'id',
      defaultHeaders: ['behaviorDetail.incidentID'],
      aliases: ['incident id', 'incident number', 'behavior incident id', 'incident', 'incident no', 'behavior incident number'],
    },
    {
      key: 'incidentDate',
      label: 'Incident date',
      category: 'behavior',
      kind: 'date',
      defaultHeaders: ['behaviorDetail.incidentDate'],
      aliases: ['incident date', 'behavior date', 'date of incident', 'behavior incident date', 'offense date'],
    },
    {
      key: 'resolutionCode',
      label: 'Resolution code',
      category: 'behavior',
      kind: 'code',
      defaultHeaders: ['behaviorDetail.resolutionCode'],
      aliases: ['resolution code', 'resolution', 'consequence', 'action code', 'resolution type', 'resolution name', 'disciplinary action', 'action taken'],
    },

    // Attendance detail (many rows per student)
    {
      key: 'attendanceDate',
      label: 'Attendance date',
      category: 'attendanceDetail',
      kind: 'date',
      defaultHeaders: ['AttendanceDetail.date'],
      aliases: ['attendance date', 'absence date', 'date absent', 'mark date', 'attendance day'],
    },
    {
      key: 'attendanceCode',
      label: 'Attendance code',
      category: 'attendanceDetail',
      kind: 'code',
      defaultHeaders: ['AttendanceDetail.code'],
      aliases: ['attendance code', 'absence code', 'att code', 'attendance mark', 'period mark', 'mark code', 'absence type'],
    },

    // Course grades (many rows per student), from Student > Grading >
    // Grading Detail. The object is "grading", not "gradingDetail".
    // Transcript Detail (transcriptDetail.*) is left out on purpose: a
    // transcript covers every year, so an old failing grade would flag a
    // student today.
    {
      key: 'courseName',
      label: 'Course name',
      category: 'courseGrades',
      kind: 'text',
      defaultHeaders: ['grading.courseName'],
      aliases: ['course name', 'course', 'course title', 'class name', 'course description', 'class title'],
    },
    {
      key: 'courseGrade',
      label: 'Course grade',
      category: 'courseGrades',
      kind: 'code',
      defaultHeaders: ['grading.score'],
      aliases: [
        'course grade',
        'letter grade',
        'grading score',
        'mark',
        'score',
        'final grade',
        'posted grade',
        'term grade',
        'grade mark',
        'score list item name',
      ],
    },
  ],
  requirements: {
    identity: [['studentNumber'], ['stateID']],
    attendanceSummary: [['absenteeismPercentage'], ['daysAbsent', 'scheduledDays']],
    gpa: [['cumGPA'], ['unweightedGPA']],
    behavior: [['incidentID'], ['incidentDate']],
    attendanceDetail: [['attendanceCode'], ['attendanceDate']],
    courseGrades: [['courseGrade']],
  },
}
