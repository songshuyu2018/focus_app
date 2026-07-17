pub mod process_tunnel;

use crate::models::ServerConfig;

pub trait SshTunnel: Send {
    fn local_port(&self) -> u16;
    fn is_alive(&mut self) -> bool;
    fn close(&mut self);
}

pub fn build_tunnel(config: &ServerConfig, local_port: u16) -> Result<process_tunnel::ProcessTunnel, String> {
    process_tunnel::ProcessTunnel::connect(config, local_port)
}
