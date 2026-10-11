import type { SisCatalog } from '../types'

// Infinite Campus Ad Hoc fields (Filter Designer, Query Wizard, Data Export).
// Default header names come from public Infinite Campus documentation.
// Districts can rename columns, so each field also lists plain-language
// aliases for fuzzy matching. Course grade field names are a best guess
// until a real header row is available (marked unverified).

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
      aliases: ['student number', 'student id', 'student num', 'local id', 'id number', 'student no', 'stu number'],
    },
    {
      key: 'stateID',
      label: 'State ID',
      category: 'identity',
      kind: 'id',
      defaultHeaders: ['student.stateID'],
      aliases: ['state id', 'state student id', 'ssid', 'marss', 'marss number', 'state number'],
    },
    {
      key: 'lastName',
      label: 'Last name',
      category: 'identity',
      kind: 'text',
      defaultHeaders: ['student.lastName'],
      aliases: ['last name', 'surname', 'family name', 'student last name'],
    },
    {
      key: 'firstName',
      label: 'First name',
      category: 'identity',
      kind: 'text',
      defaultHeaders: ['student.firstName'],
      aliases: ['first name', 'given name', 'student first name'],
    },
    {
      key: 'grade',
      label: 'Grade level',
      category: 'identity',
      kind: 'grade',
      defaultHeaders: ['student.grade'],
      aliases: ['grade level', 'current grade', 'student grade', 'grade', 'gr'],
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
      ],
      note: 'Accepts 12.5, 12.5%, or 0.125.',
    },
    {
      key: 'daysAbsent',
      label: 'Days absent',
      category: 'attendanceSummary',
      kind: 'number',
      defaultHeaders: ['attChronicAbsenteeism.daysAbsent'],
      aliases: ['days absent', 'absent days', 'total absences', 'total days absent'],
    },
    {
      key: 'scheduledDays',
      label: 'Scheduled days',
      category: 'attendanceSummary',
      kind: 'number',
      defaultHeaders: ['attChronicAbsenteeism.scheduledDays'],
      aliases: ['scheduled days', 'days scheduled', 'days enrolled', 'enrolled days', 'membership days', 'days in membership'],
    },
    {
      key: 'chronicallyAbsent',
      label: 'Chronically absent (district flag)',
      category: 'attendanceSummary',
      kind: 'flag',
      defaultHeaders: ['attChronicAbsenteeism.chronicallyAbsent'],
      aliases: ['chronically absent', 'chronic absentee', 'chronic absence', 'chronic flag'],
      note: '1 or 0, or Y or N.',
    },

    // GPA
    {
      key: 'cumGPA',
      label: 'Cumulative GPA',
      category: 'gpa',
      kind: 'number',
      defaultHeaders: ['cumGPA.cumGPA'],
      aliases: ['cumulative gpa', 'cum gpa', 'weighted gpa', 'gpa'],
    },
    {
      key: 'unweightedGPA',
      label: 'Unweighted cumulative GPA',
      category: 'gpa',
      kind: 'number',
      defaultHeaders: ['unweightedGPA.cumGPA'],
      aliases: ['unweighted gpa', 'unweighted cumulative gpa', 'unweighted cum gpa'],
    },

    // Behavior incidents (many rows per student)
    {
      key: 'incidentID',
      label: 'Incident ID',
      category: 'behavior',
      kind: 'id',
      defaultHeaders: ['behaviorDetail.incidentID'],
      aliases: ['incident id', 'incident number', 'behavior incident id', 'incident'],
    },
    {
      key: 'incidentDate',
      label: 'Incident date',
      category: 'behavior',
      kind: 'date',
      defaultHeaders: ['behaviorDetail.incidentDate'],
      aliases: ['incident date', 'behavior date', 'date of incident'],
    },
    {
      key: 'resolutionCode',
      label: 'Resolution code',
      category: 'behavior',
      kind: 'code',
      defaultHeaders: ['behaviorDetail.resolutionCode'],
      aliases: ['resolution code', 'resolution', 'consequence', 'action code'],
    },

    // Attendance detail (many rows per student)
    {
      key: 'attendanceDate',
      label: 'Attendance date',
      category: 'attendanceDetail',
      kind: 'date',
      defaultHeaders: ['AttendanceDetail.date'],
      aliases: ['attendance date', 'absence date'],
    },
    {
      key: 'attendanceCode',
      label: 'Attendance code',
      category: 'attendanceDetail',
      kind: 'code',
      defaultHeaders: ['AttendanceDetail.code'],
      aliases: ['attendance code', 'absence code', 'att code'],
    },

    // Course grades (many rows per student). Unverified field names.
    {
      key: 'courseName',
      label: 'Course name',
      category: 'courseGrades',
      kind: 'text',
      defaultHeaders: ['gradingDetail.courseName'],
      aliases: ['course name', 'course', 'course title', 'class name'],
      unverified: true,
    },
    {
      key: 'courseGrade',
      label: 'Course grade',
      category: 'courseGrades',
      kind: 'code',
      defaultHeaders: ['gradingDetail.score'],
      aliases: ['course grade', 'letter grade', 'grading score', 'mark', 'score', 'final grade'],
      unverified: true,
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
