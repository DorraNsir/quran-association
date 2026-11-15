/**
 * Arabic UI strings. Wording is taken from the web app (frontend/src) so
 * both clients use the same terminology.
 */
export const ar = {
  appName: 'الفرع المحلي عمر بن الخطاب',
  appFullName: 'الفرع المحلي عمر بن الخطاب بدار شعبان الفهري',
  appTagline: 'منصة التسيير والمتابعة البيداغوجية',
  roles: { ADMIN: 'مسؤول إداري', TEACHER: 'معلم', STUDENT: 'طالب' },
  states: {
    loading: 'جارٍ التحميل…',
    emptyTitle: 'لا توجد بيانات',
    errorTitle: 'تعذّر تحميل البيانات',
    forbiddenTitle: 'ليس لديك صلاحية للوصول إلى هذه البيانات',
    offlineTitle: 'لا يوجد اتصال بالخادم',
    retry: 'إعادة المحاولة',
  },
  notFound: {
    title: 'الصفحة غير موجودة',
    description: 'العنصر المطلوب غير موجود أو لم يعد متاحًا.',
    back: 'العودة إلى الرئيسية',
  },
  auth: {
    loginTitle: 'تسجيل الدخول',
    hadith: '«خيركم من تعلّم القرآن وعلّمه»',
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    submit: 'تسجيل الدخول',
    usernameRequired: 'أدخل اسم المستخدم',
    passwordRequired: 'أدخل كلمة المرور',
    accountsNote: 'الحسابات تُنشأ من طرف إدارة الجمعية.',
    expiredNotice: 'انتهت جلستك. يرجى تسجيل الدخول من جديد.',
    inactiveNotice: 'هذا الحساب معطّل. يرجى التواصل مع إدارة الجمعية.',
    restoring: 'جارٍ التحقق من الجلسة…',
    offlineTitle: 'تعذّر الاتصال بالخادم',
    offlineDescription:
      'جلستك محفوظة على هذا الجهاز. تحقّق من الاتصال ثم أعد المحاولة.',
    logout: 'تسجيل الخروج',
    logoutConfirmTitle: 'تسجيل الخروج',
    logoutConfirmMessage: 'هل تريد تسجيل الخروج من هذا الجهاز؟',
    cancel: 'إلغاء',
    changePasswordTitle: 'تغيير كلمة المرور',
    changePasswordForced:
      'هذا أول دخول لك أو أُعيد تعيين كلمة مرورك: يجب اختيار كلمة مرور جديدة قبل الوصول إلى فضاء العمل.',
    currentPassword: 'كلمة المرور الحالية',
    newPassword: 'كلمة المرور الجديدة',
    confirmPassword: 'تأكيد كلمة المرور الجديدة',
    savePassword: 'حفظ كلمة المرور',
    currentRequired: 'أدخل كلمة المرور الحالية',
    passwordTooShort: 'كلمة المرور يجب أن تتكوّن من 8 أحرف على الأقل',
    passwordTooLong: 'كلمة المرور طويلة جدًا (128 حرفًا على الأكثر)',
    passwordSame: 'اختر كلمة مرور مختلفة عن الحالية',
    confirmMismatch: 'التأكيد لا يطابق كلمة المرور الجديدة',
    passwordChanged: 'تم تغيير كلمة المرور بنجاح',
  },
  workspace: {
    admin: 'فضاء الإدارة',
    teacher: 'فضاء المعلم',
    student: 'فضاء الطالب',
    switchTitle: 'تبديل مساحة العمل',
    account: 'الحساب',
    roles: 'الصفات',
    comingTitle: 'محتوى هذا الفضاء قيد الإعداد',
    comingDescription: 'ستُضاف وحدات هذا الفضاء في المراحل القادمة من تطبيق الهاتف.',
    noWorkspaceTitle: 'لا يوجد فضاء عمل متاح',
    noWorkspaceDescription:
      'لا يملك هذا الحساب فضاء عمل متاحًا. يرجى التواصل مع إدارة الجمعية.',
  },
  system: {
    connection: 'الاتصال بالخادم',
    connected: 'متصل بالخادم',
    databaseDown: 'الخادم يعمل لكن قاعدة البيانات غير متاحة',
    apiUrl: 'عنوان الخادم',
    authPending: 'تسجيل الدخول قيد الإعداد',
    authPendingDescription:
      'سيتم تفعيل تسجيل الدخول بحسابات المنصة (المسؤول، المعلم، الطالب) في المرحلة القادمة.',
  },
} as const;
