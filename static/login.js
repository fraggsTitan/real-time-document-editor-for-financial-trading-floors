const msg = document.getElementById("msg");

// Company sign-up
document.getElementById("companySignupBtn").addEventListener("click", async (event) => {
  event.preventDefault();  // prevent page refresh
  const name = document.getElementById("companyName").value;
  const res = await fetch("/signup/company", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({company_name: name})
  });
  const data = await res.json();
  msg.innerText = data.status === "ok" ? 
    `Company created! Password: ${data.company_password}` : data.message;
});

// Employee sign-up
document.getElementById("employeeSignupBtn").addEventListener("click", async (event) => {
  event.preventDefault();  // prevent page refresh
  const name = document.getElementById("employeeName").value;
  const email = document.getElementById("employeeEmail").value;
  const password = document.getElementById("employeePassword").value;
  const companyPassword = document.getElementById("companyPassword").value;

  const res = await fetch("/signup/employee", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({name, email, password, company_password: companyPassword})
  });
  const data = await res.json();
  msg.innerText = data.status === "ok" ? data.message : data.message;
});

// Login
document.getElementById("loginBtn").addEventListener("click", async (event) => {
  event.preventDefault();  // prevent page refresh
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  const res = await fetch("/login", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, password})
  });
  const data = await res.json();
  msg.innerText = data.status === "ok" ? "Login successful!" : data.message;
  if (data.status === "ok") window.location.href = "/";
});
