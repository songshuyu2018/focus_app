use std::io::BufRead;
use std::process::{Child, Command, Stdio};

use crate::models::{AuthType, ServerConfig};
use super::SshTunnel;

pub struct ProcessTunnel {
    child: Child,
    local_port: u16,
}

impl ProcessTunnel {
    pub fn connect(config: &ServerConfig, local_port: u16) -> Result<Self, String> {
        let remote = format!("{}@{}", config.username, config.host);

        let mut cmd: Command;

        #[cfg(not(target_os = "windows"))]
        {
            if config.auth_type == AuthType::Password {
                let password = config.password.as_deref().unwrap_or("");
                if password.is_empty() {
                    return Err("密码认证需要提供密码".into());
                }
                cmd = Command::new("sshpass");
                cmd.arg("-p").arg(password);
                cmd.arg("ssh");
            } else {
                cmd = Command::new("ssh");
            }
        }
        #[cfg(target_os = "windows")]
        {
            cmd = Command::new("ssh");
        }

        cmd.args([
            "-N",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "ServerAliveInterval=30",
            "-o", "ExitOnForwardFailure=yes",
            "-p", &config.port.to_string(),
            "-L", &format!("{}:localhost:8000", local_port),
            &remote,
        ]);

        if let Some(ref key_path) = config.key_path {
            if !key_path.is_empty() {
                cmd.arg("-i").arg(key_path);
            }
        }

        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut child = cmd.spawn().map_err(|e| format!("SSH 启动失败: {}", e))?;

        let stderr = child.stderr.take();
        std::thread::spawn(move || {
            if let Some(stderr) = stderr {
                let reader = std::io::BufReader::new(stderr);
                for line in reader.lines().map_while(Result::ok) {
                    eprintln!("[ssh tunnel] {}", line);
                }
            }
        });

        std::thread::sleep(std::time::Duration::from_millis(800));

        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!(
                    "SSH 连接失败 (退出码: {:?})。请检查主机地址、端口、用户名和认证信息是否正确",
                    status.code()
                ));
            }
            Ok(None) => {}
            Err(e) => {
                return Err(format!("SSH 进程检查失败: {}", e));
            }
        }

        Ok(ProcessTunnel { child, local_port })
    }
}

impl SshTunnel for ProcessTunnel {
    fn local_port(&self) -> u16 {
        self.local_port
    }

    fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    fn close(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for ProcessTunnel {
    fn drop(&mut self) {
        self.close();
    }
}
