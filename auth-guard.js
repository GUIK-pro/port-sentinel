/* ============================================================
 * 东莞首靠船识别助手 · 登录守卫 + 用户存储
 * 用途：未登录访问任意业务页 → 自动跳转 login.html
 * 暴露：window.dgmsaLogout() / dgmsaCurrentUser() / dgmsaValidateUser() / dgmsaRegisterUser() / dgmsaGetUsers()
 * ============================================================ */
(function () {
  var AUTH_KEY = 'dgmsa_auth';
  var USER_KEY = 'dgmsa_users';
  var LOGIN_PAGE = 'login.html';

  // ===== 用户存储层 =====
  function loadUsers(){
    try{
      var raw = localStorage.getItem(USER_KEY);
      if(raw){
        var arr = JSON.parse(raw);
        if(Array.isArray(arr) && arr.length) return arr;
      }
    }catch(e){}
    return null;
  }

  function saveUsers(arr){
    try{ localStorage.setItem(USER_KEY, JSON.stringify(arr)); }catch(e){}
  }

  // 种子用户：admin 默认账户（名称: admin, 部门: 东莞海事局）
  function seedAdmin(){
    var users = loadUsers();
    if(users) return users;
    var admin = {
      id: 1,
      phone: '',
      name: 'admin',
      password: 'admin',
      dept: '东莞海事局',
      role: '系统管理员',
      createdAt: new Date().toISOString(),
    };
    saveUsers([admin]);
    return [admin];
  }

  seedAdmin();

  // ===== 公开 API =====

  // 校验登录：支持用户名或手机号登录，返回脱敏 user 或 null
  window.dgmsaValidateUser = function(username, password){
    var users = loadUsers();
    if(!users) return null;
    for(var i=0; i<users.length; i++){
      var u = users[i];
      if((u.name === username || u.phone === username) && u.password === password){
        return { id:u.id, phone:u.phone, name:u.name, dept:u.dept, role:u.role||'执法人员', loginAt:new Date().toISOString() };
      }
    }
    return null;
  };

  // 注册新用户：返回 { ok:true, user } 或 { ok:false, msg }
  window.dgmsaRegisterUser = function(fields){
    var phone = (fields.phone||'').trim();
    var name  = (fields.name||'').trim();
    var pwd   = fields.password || '';
    var dept  = (fields.dept||'').trim();

    if(!phone && !name) return { ok:false, msg:'手机号或用户名称至少填一项。' };
    if(!name) return { ok:false, msg:'请输入用户名称。' };
    if(!pwd || pwd.length < 4) return { ok:false, msg:'密码至少 4 位。' };
    if(!dept) return { ok:false, msg:'请选择所在部门。' };

    var users = loadUsers() || [];
    for(var i=0; i<users.length; i++){
      if(users[i].name === name) return { ok:false, msg:'用户名称已存在。' };
      if(phone && users[i].phone === phone) return { ok:false, msg:'手机号已被注册。' };
    }
    var maxId = 0;
    users.forEach(function(u){ if(u.id > maxId) maxId = u.id; });
    var newUser = {
      id: maxId + 1,
      phone: phone,
      name: name,
      password: pwd,
      dept: dept,
      role: '执法人员',
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    saveUsers(users);
    return { ok:true, user: { id:newUser.id, phone:newUser.phone, name:newUser.name, dept:newUser.dept, role:newUser.role, loginAt:new Date().toISOString() } };
  };

  // 获取全部用户列表（脱敏，不含密码）
  window.dgmsaGetUsers = function(){
    var users = loadUsers();
    if(!users) return [];
    return users.map(function(u){
      return { id:u.id, phone:u.phone, name:u.name, dept:u.dept, role:u.role||'执法人员', createdAt:u.createdAt };
    });
  };

  // 更新用户信息：返回 { ok:true, user } 或 { ok:false, msg }
  window.dgmsaUpdateUser = function(userId, updates){
    var users = loadUsers();
    if(!users) return { ok:false, msg:'用户数据加载失败。' };
    var target = null;
    for(var i=0; i<users.length; i++){
      if(users[i].id === userId){
        target = users[i];
        break;
      }
    }
    if(!target) return { ok:false, msg:'用户不存在。' };
    
    // 更新字段（只允许更新非敏感字段）
    // 检查 name/phone 唯一性冲突
    var newName = (updates.name !== undefined) ? String(updates.name).trim() : target.name;
    var newPhone = (updates.phone !== undefined) ? String(updates.phone).trim() : target.phone;
    if(newName !== target.name){
      for(var j=0; j<users.length; j++){
        if(users[j].id !== userId && users[j].name === newName)
          return { ok:false, msg:'用户名称「'+newName+'」已被占用。' };
      }
    }
    if(newPhone && newPhone !== target.phone){
      for(var k=0; k<users.length; k++){
        if(users[k].id !== userId && users[k].phone === newPhone)
          return { ok:false, msg:'手机号「'+newPhone+'」已被注册。' };
      }
    }
    if(updates.name !== undefined) target.name = newName;
    if(updates.phone !== undefined) target.phone = newPhone;
    if(updates.dept !== undefined) target.dept = updates.dept;
    if(updates.role !== undefined) target.role = updates.role;
    
    saveUsers(users);
    return { ok:true, user: { id:target.id, phone:target.phone, name:target.name, dept:target.dept, role:target.role } };
  };

  // ===== 守卫逻辑 =====
  var path = (location.pathname || '').split('/').pop() || '';
  try { path = decodeURIComponent(path); } catch (e) {}

  // 登录页 + 注册页不拦截
  if (path === LOGIN_PAGE || path === 'register.html') return;

  var token = null;
  try { token = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY); } catch (e) {}

  // dgmsaLogout 必须在守卫跳转前定义，确保未登录时也能调用（清除残余 token）
  window.dgmsaLogout = function () {
    try {
      sessionStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem('dgmsa_redirect');
    } catch (e) {}
    location.replace(LOGIN_PAGE);
  };

  window.dgmsaCurrentUser = function () {
    try { return JSON.parse(token); } catch (e) { return { name: 'admin', role: '系统管理员', dept: '东莞海事局' }; }
  };

  if (!token) {
    try { sessionStorage.setItem('dgmsa_redirect', path || 'index.html'); } catch (e) {}
    location.replace(LOGIN_PAGE);
    return;
  }
})();